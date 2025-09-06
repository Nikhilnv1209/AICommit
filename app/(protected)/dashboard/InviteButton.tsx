"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import useProject from "@/hooks/use-project";
import { Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const InviteButton = () => {
  const { project } = useProject();
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => {
    if (project) {
      setInviteLink(`${window.location.origin}/join/${project.id}`);
    }
  }, [project]);

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success("Invite link copied to clipboard!");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="px-2 sm:px-4">
          <UserPlus className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Invite Members</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="p-10">
        <DialogHeader>
          <DialogTitle>Invite team members</DialogTitle>
          <DialogDescription>
            Ask team members to copy and paste this link
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <div className="grid flex-1 gap-2">
            <input
              id="link"
              defaultValue={inviteLink}
              readOnly
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button type="submit" size="sm" className="px-3" onClick={handleCopy}>
            <span className="sr-only">Copy</span>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InviteButton;
