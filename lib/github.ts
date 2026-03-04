import { prisma } from "@/prisma/client"
import { Octokit } from "octokit"
import axios from "axios"
import { aiSummarizeCommit } from "./ai"
import { logError, logInfo, logDebug } from './logger'

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

export type CommitResponse = {
  commitHash: string
  commitAuthorName: string
  commitAuthorAvatar: string
  commitMessage: string
  commitDate: string
}

// extent the commitresponse to add two new fiels to make processedCommit type
type ProcessedCommit = CommitResponse & {
  summary: string
  projectId: string
}

export const getRepoCommits = async (githubUrl: string) => {
  try {
    const [owner, repo] = githubUrl!.split("/").slice(-2)
    if (!owner || !repo) {
      throw new Error("Invalid GitHub URL")
    }
    const { data } = await octokit.rest.repos.listCommits({
      owner: owner,
      repo: repo,
    })

    const sortCommits = data.sort((a: any, b: any) => {
      return new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime()
    }) as any[]

    return sortCommits.slice(0, 10).map((commit) => ({
      commitHash: commit.sha as string,
      commitAuthorName: commit.commit?.author?.name ?? "",
      commitAuthorAvatar: commit.author?.avatar_url ?? "",
      commitMessage: commit.commit.message ?? "",
      commitDate: commit.commit?.author?.date ?? "",
    }))
  } catch (error) {
    logError('GetCommits', 'Error fetching commit hashes:', error)
    return []
  }
}

export type PollCommitsProgress = {
  current: number;
  total: number;
  currentCommit?: string;
  success: number;
  failed: number;
};

export const pollCommits = async (
  projectId: string,
  githubUrl: string,
  onProgress?: (progress: PollCommitsProgress) => void
) => {
  try {
    const RepoCommits = await getRepoCommits(githubUrl)
    const unProcessedCommits = await filterUnprocessedCommits(projectId, RepoCommits)

    if (unProcessedCommits.length === 0) {
      logInfo('PollCommits', 'No new commits to process')
      return { added: 0, success: 0, failed: 0 }
    }

    logInfo('PollCommits', `Processing ${unProcessedCommits.length} new commits`, true)

    const processedCommits: ProcessedCommit[] = []
    let successCount = 0
    let failedCount = 0

    // Process commits one by one to report per-commit progress
    for (let i = 0; i < unProcessedCommits.length; i++) {
      const commit = unProcessedCommits[i]
      
      // Report progress before processing each commit
      onProgress?.({
        current: i,
        total: unProcessedCommits.length,
        currentCommit: commit.commitMessage?.split('\n')[0] || commit.commitHash.substring(0, 7),
        success: successCount,
        failed: failedCount
      })

      try {
        const summary = await summerizeCommit(githubUrl, commit.commitHash)
        processedCommits.push({
          projectId,
          commitHash: commit.commitHash,
          commitAuthorName: commit.commitAuthorName,
          commitAuthorAvatar: commit.commitAuthorAvatar,
          commitMessage: commit.commitMessage,
          commitDate: commit.commitDate,
          summary
        })
        successCount++
      } catch (error) {
        logError('ProcessCommit', `Error processing commit ${commit.commitHash}:`, error)
        failedCount++
      }

      // Report progress after processing each commit
      onProgress?.({
        current: i + 1,
        total: unProcessedCommits.length,
        currentCommit: commit.commitMessage?.split('\n')[0] || commit.commitHash.substring(0, 7),
        success: successCount,
        failed: failedCount
      })
    }

    if (processedCommits.length > 0) {
      const commits = await prisma.commit.createMany({
        data: processedCommits
      })

      logInfo('PollCommits', `Successfully added ${commits.count} commits to the database`, true)
      return { count: commits.count, success: successCount, failed: failedCount }
    } else {
      logInfo('PollCommits', 'No commits were successfully processed', true)
      return { count: 0, success: successCount, failed: failedCount }
    }
  } catch (error: any) {
    const errorMessage = error && typeof error === 'object' && error.message 
      ? error.message 
      : 'Unknown error occurred while polling commits';
    
    logError('PollCommits', 'Error polling commits:', error || 'Unknown error')
    return { error: errorMessage, success: 0, failed: 0, count: 0 }
  }
}

async function summerizeCommit(githubUrl: string, commitHash: string) {
  try {
    const response = await axios.get(`${githubUrl}/commit/${commitHash}.diff`, {
      headers: { Accept: "application/vnd.github.v3.diff" }
    });
    const { data } = response;
    
    if (data == null || data.trim() === "") {
      throw new Error(`Empty diff for commit ${commitHash}`);
    }
    
    return await aiSummarizeCommit(data) || "";
  } catch (error) {
    logError('SummarizeCommit', `Error getting or summarizing commit ${commitHash}:`, error);
    throw error;
  }
}


async function filterUnprocessedCommits(projectId: string, RepoCommits: CommitResponse[]) {
  try {
    const processedCommits = await prisma.commit.findMany({
      where: {
        projectId
      },
      select: {
        commitHash: true
      }
    })

    const processedHashes = new Set(processedCommits.map(commit => commit.commitHash))

    return RepoCommits.filter(commit => !processedHashes.has(commit.commitHash))
  } catch (error) {
    logError('FilterCommits', 'Error filtering unprocessed commits:', error)
    return []
  }
}

export const getDefaultBranch = async (githubUrl: string) => {
  const [owner, repo] = githubUrl!.split("/").slice(-2)
  if (!owner || !repo) {
    throw new Error("Invalid GitHub URL")
  }
  const { data: branch } = await octokit.rest.repos.get({
    owner: owner,
    repo: repo,
  })

  return branch.default_branch
}