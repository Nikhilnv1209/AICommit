"use client";
import { useUser } from '@clerk/nextjs'
import React from 'react'

const DashBoard = () => {
  const { user } = useUser();

  return (
    <>
    <div>{user?.fullName}</div>
    <div>{user?.lastName}</div>
    </>
  )
}

export default DashBoard
