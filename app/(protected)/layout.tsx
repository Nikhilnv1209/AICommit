import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { UserButton } from '@clerk/nextjs'
import React from 'react'
import AppSidebar from './app-sidebar'
import { ThemeSwitcher } from '@/components/theme/theme-switcher'

type Props = {
  children: React.ReactNode
}

const SideBarLayout = ({ children }: Props) => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="w-full overflow-x-hidden p-2 md:p-3">
        <div className="flex h-14 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-4">
            <SidebarTrigger className="-ml-1 md:hidden" />
            <div className="ml-auto flex items-center gap-2">
              <ThemeSwitcher />
              <UserButton />
            </div>
        </div>
          {/* main content */}
          <div className="mt-2 h-[calc(100vh-5.5rem)] overflow-y-auto overflow-x-hidden rounded-lg border border-sidebar-border bg-background p-4 sm:p-6">
            {children}
          </div>
      </main>
    </SidebarProvider>
  )
}

export default SideBarLayout
