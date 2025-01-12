import { prisma } from "@/prisma/client"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

const SyncUser = async () => {
  const { userId } = await auth()

  if(!userId) {
    throw new Error("User not found")
  }

  const clerkclient = await clerkClient()
  const user = await clerkclient.users.getUser(userId)

  if (!user.emailAddresses[0].emailAddress) {
    throw new Error("User email not found")
  }

  await prisma.user.upsert({
    where: {
      emailAddress: user.emailAddresses[0].emailAddress ?? "",
    },
    update: {
      imageUrl: user.imageUrl,
      firstName: user.firstName as string,
      lastName: user.lastName as string,
    },
    create: {
      id: user.id,
      emailAddress: user.emailAddresses[0].emailAddress,
      firstName: user.firstName as string,
      lastName: user.lastName as string,
      imageUrl: user.imageUrl,
    }
  })

  return redirect("/dashboard")
}

export default SyncUser
