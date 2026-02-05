<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Fingerprint } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="cn('flex flex-col gap-6', props.class)">
    <Card>
      <CardHeader>
        <CardTitle>Anmelden</CardTitle>
        <CardDescription> Melden Sie sich mit Ihrem Konto an </CardDescription>
      </CardHeader>
      <CardContent>
        <form>
          <FieldGroup>
            <Field>
              <FieldLabel for="email"> E-Mail </FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="name@beispiel.de"
                required
              />
            </Field>
            <Field>
              <div class="flex items-center">
                <FieldLabel for="password"> Passwort </FieldLabel>
                <a
                  href="/reset-password"
                  class="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  Passwort vergessen?
                </a>
              </div>
              <Input id="password" type="password" required />
            </Field>
            <Field>
              <Button type="submit" class="w-full"> Anmelden </Button>
            </Field>
          </FieldGroup>
        </form>
        <div class="relative my-4 flex items-center justify-center">
          <Separator class="absolute w-full" />
          <span
            class="bg-card text-muted-foreground relative z-10 px-2 text-xs uppercase"
          >
            oder
          </span>
        </div>
        <Button variant="outline" type="button" class="w-full">
          <Fingerprint class="mr-2 size-4" />
          Mit Passkey anmelden
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
