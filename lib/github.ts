import { prisma } from "@/prisma/client"
import { Octokit } from "octokit"
import axios from "axios"
import { aisummarizeCommit } from "./gemini"

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

export type CommitResponse = {
  commitHash         : string
  commitAuthorName   : string
  commitAuthorAvatar : string
  commitMessage      : string
  commitDate         : string
}

export const getRepoCommits = async (githubUrl: string): Promise<CommitResponse[]> => {
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
      commitHash         : commit.sha as string,
      commitAuthorName   : commit.commit?.author?.name ?? "",
      commitAuthorAvatar : commit.author?.avatar_url ?? "",
      commitMessage      : commit.commit.message ?? "",
      commitDate         : commit.commit?.author?.date ?? "",
    }))
  } catch (error) {
    console.error("Error fetching commit hashes:", error)
    return []
  }
}

export const pollCommits = async (projectId: string, githubUrl: string) => {
  try {
    const RepoCommits = await getRepoCommits(githubUrl)
    const unProcessedCommits = await filterUnprocessedCommits(projectId, RepoCommits)

    const summaryResponses = await Promise.allSettled(unProcessedCommits.map(commit => {
      return summerizeCommit(githubUrl, commit.commitHash)
    }))

    const summeries = summaryResponses.map((response) => {
      if (response.status === "fulfilled") {
        return response.value as string
      }
      return ''
    })

    const commits = await prisma.commit.createMany({
      data: summeries.map((summary, index) => (
        {
        projectId,
        commitHash         : unProcessedCommits[index]!.commitHash,
        commitAuthorName   : unProcessedCommits[index]!.commitAuthorName,
        commitAuthorAvatar : unProcessedCommits[index]!.commitAuthorAvatar,
        commitMessage      : unProcessedCommits[index]!.commitMessage,
        commitDate         : unProcessedCommits[index]!.commitDate,
        summary
      }))
    })

    return commits
  } catch (error) {
    console.error("Error polling commits:", error)
  }
}

async function summerizeCommit(githubUrl: string, commitHash: string) {
  const { data } = await axios.get(`${githubUrl}/commit/${commitHash}.diff`, {
    headers: {
      Accept: "application/vnd.github.v3.diff"
    }
  })
  
  return await aisummarizeCommit(data) || ""
}

async function filterUnprocessedCommits(projectId: string, RepoCommits: CommitResponse[]) {
  try {
    const processedCommits = await prisma.commit.findMany({
      where: {
        projectId
      }
    })

    return RepoCommits.filter((commit) => 
      !processedCommits.some((processedCommit) => processedCommit.commitHash === commit.commitHash)
    )
  } catch (error) {
    console.error("Error filtering unprocessed commits:", error)
    return []
  }
}
