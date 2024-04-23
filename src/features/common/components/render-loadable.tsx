import { asError } from '@/utils/error'
import { Loadable } from 'jotai/vanilla/utils/loadable'
import { Loader2 as Loader } from 'lucide-react'

type RenderLoadableProps<T> = {
  loadable: Loadable<T>
  children: (data: Awaited<T>) => React.ReactNode
  fallback?: React.ReactNode
  transformError?: (error: Error) => Error | undefined
}

export function RenderLoadable<T>({ loadable, children, fallback, transformError }: RenderLoadableProps<T>) {
  if (loadable.state === 'hasData') {
    return <>{children(loadable.data)}</>
  } else if (loadable.state === 'loading') {
    return <>{fallback ?? <Loader className="size-10 animate-spin" />}</>
  }

  const error = transformError ? transformError(asError(loadable.error)) : asError(loadable.error)
  if (error) {
    throw error
  }

  return <></>
}