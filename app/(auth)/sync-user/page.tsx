import { prisma } from "@/prisma/client"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit"

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

  recordAudit.request({
    action: AUDIT_ACTIONS.USER_SYNC,
    actorId: user.id,
    target: user.emailAddresses[0].emailAddress,
    metadata: { source: "clerk" },
  })

  return redirect("/dashboard")
}

export default SyncUser
