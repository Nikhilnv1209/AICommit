import { SidebarProvider } from '@/components/ui/sidebar'
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
      <main className='w-full m-2'>
        <div className='flex items-center gap-2 border-sidebar-border bg-sidebar border shadow rounded-md px-4 py-2'>
            {/* Seachbar component */}
            <div className="ml-auto flex items-center gap-2">
              <ThemeSwitcher />
              <UserButton />
            </div>
        </div>
          {/* main content */}
          <div className='border-sidebar-border bg-sidebar border shadow rounded-md overflow-y-scroll h-[calc(100vh-5rem)] p-4 mt-2'>
            {children}
          </div>
      </main>
    </SidebarProvider>
  )
}

export default SideBarLayout
