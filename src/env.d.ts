/// <reference types="astro/client" />

type Auth = typeof import('@/lib/auth').auth

declare namespace App {
  interface Locals {
    user: Auth['$Infer']['Session']['user']
    session: Auth['$Infer']['Session']['session']
  }
}
