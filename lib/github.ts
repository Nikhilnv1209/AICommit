import { prisma } from "@/prisma/client"
import { Octokit } from "octokit"

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

const githubUrl = "https://github.com/docker/genai-stack"

type Response = {
  commitHash         : string
  commitAuthorName   : string
  commitAuthorAvatar : string
  commitMessage      : string
  commitDate         : string
}

export const getCommitHashes = async (githubUrl: string): Promise<Response[]> => {
  try {
    const [owner, repo] = githubUrl.split("/").slice(-2)
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

export const pollCommits = async (projectId: string) => {
  try {
    const { project, githubUrl } = await fetchProjectGithubUrl(projectId)
    const commitHashes = await getCommitHashes(githubUrl)
    const unProcessedCommits = await filterUnprocessedCommits(projectId, commitHashes)
    console.log(unProcessedCommits)
  } catch (error) {
    console.error("Error polling commits:", error)
  }
}

async function fetchProjectGithubUrl(projectId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        githubUrl: true
      }
    })

    if (!project) {
      throw new Error("Project not found")
    }
    
    return { project, githubUrl: project?.githubUrl }
  } catch (error) {
    console.error("Error fetching project GitHub URL:", error)
    throw error
  }
}

async function filterUnprocessedCommits(projectId: string, commitHashes: Response[]) {
  try {
    const processedCommits = await prisma.commit.findMany({
      where: {
        projectId
      }
    })

    return commitHashes.filter((commit) => 
      !processedCommits.some((processedCommit) => processedCommit.commitHash === commit.commitHash)
    )
  } catch (error) {
    console.error("Error filtering unprocessed commits:", error)
    return []
  }
}

await pollCommits("cm7c6e5vo000052mcwwez1u41")
