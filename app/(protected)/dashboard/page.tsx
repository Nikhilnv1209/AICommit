"use client";

import useProject from '@/hooks/use-project';
import { ExternalLinkIcon, Github } from 'lucide-react';
import Link from 'next/link';
import CommitLogs from './commit-logs';
import AskQuestionsCard from './ask-questions-card';

const DashBoard = () => {
  const { project } = useProject();

  return (
    <div>
      <div className='flex items-center justify-between flex-wrap gap-y-4'>
        {/* GitHub link */}
        <div className='w-fit rounded-md bg-primary px-4 py-3'>
          <div className="flex items-center">
            <Github className='text-white size-5' />
            <div className="ml-2">
              <p className='text-sm font-medium text-white'>
                This Project is linked to {' '}
                <Link href={project?.githubUrl || ''} className='inline-flex items-center text-white/80 hover:underline'>
                  {project?.githubUrl}
                  <ExternalLinkIcon className='ml-1 size-4' />
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="h-4"></div>

        <div className='flex items-center gap-4'>
          TeamsMembers
          Addmembers
          ArchiveButton         
        </div>
      </div>

      <div className="mt-4">
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-5'>
          <AskQuestionsCard/>
          Meeting card
        </div>
      </div>

      <div className="mt-8"></div>

      {/* 🔹 Wrap CommitLogs with Suspense */}
        <CommitLogs />
    </div>
  );
};

export default DashBoard;
