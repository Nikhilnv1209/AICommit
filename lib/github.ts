import { prisma } from "@/prisma/client"
import { Octokit } from "octokit"
import axios from "axios"
import { aiSummarizeCommit } from "./gemini"
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

export const pollCommits = async (projectId: string, githubUrl: string) => {
  try {
    const RepoCommits = await getRepoCommits(githubUrl)
    const unProcessedCommits = await filterUnprocessedCommits(projectId, RepoCommits)

    if (unProcessedCommits.length === 0) {
      logInfo('PollCommits', 'No new commits to process')
      return { added: 0 }
    }

    logInfo('PollCommits', `Processing ${unProcessedCommits.length} new commits`, true) // Important for monitoring

    // Process commits in batches to avoid overwhelming the queue
    const batchSize = 5
    const commitBatches = []

    for (let i = 0; i < unProcessedCommits.length; i += batchSize) {
      commitBatches.push(unProcessedCommits.slice(i, i + batchSize))
    }

    const processedCommits: ProcessedCommit[] = []

    for (let batch = 0; batch < commitBatches.length; batch++) {
      logDebug('PollCommits', `Processing commit batch ${batch + 1}/${commitBatches.length}`)

      const batchResults = await Promise.allSettled(
        commitBatches[batch].map(async (commit) => {
          try {
            const summary = await summerizeCommit(githubUrl, commit.commitHash)
            return {
              projectId,
              commitHash: commit.commitHash,
              commitAuthorName: commit.commitAuthorName,
              commitAuthorAvatar: commit.commitAuthorAvatar,
              commitMessage: commit.commitMessage,
              commitDate: commit.commitDate,
              summary
            }
          } catch (error) {
            logError('ProcessCommit', `Error processing commit ${commit.commitHash}:`, error)
            throw error
          }
        })
      )

      // Filter successful results and add to processed commits
      batchResults.forEach(result => {
        if (result.status === "fulfilled") {
          processedCommits.push(result.value)
        }
      })
    }

    if (processedCommits.length > 0) {
      const commits = await prisma.commit.createMany({
        data: processedCommits
      })

      logInfo('PollCommits', `Successfully added ${commits.count} commits to the database`, true)
      return commits
    } else {
      logInfo('PollCommits', 'No commits were successfully processed', true)
      return { count: 0 }
    }
  } catch (error: any) {
    // Improved error handling
    const errorMessage = error && typeof error === 'object' && error.message 
      ? error.message 
      : 'Unknown error occurred while polling commits';
    
    logError('PollCommits', 'Error polling commits:', error || 'Unknown error')
    return { error: errorMessage }
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