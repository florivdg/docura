<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
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

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="cn('flex flex-col gap-6', props.class)">
    <Card>
      <CardHeader>
        <CardTitle>Passwort zurücksetzen</CardTitle>
        <CardDescription>
          Geben Sie Ihre E-Mail-Adresse ein, um einen Link zum Zurücksetzen zu
          erhalten.
        </CardDescription>
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
              <Button type="submit" class="w-full"> Link senden </Button>
            </Field>
          </FieldGroup>
        </form>
        <div class="mt-4 text-center text-sm">
          <a href="/login" class="underline-offset-4 hover:underline">
            Zurück zur Anmeldung
          </a>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
