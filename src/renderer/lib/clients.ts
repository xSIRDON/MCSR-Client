import { createMcsrClient } from '@services/mcsr-ranked'
import { createPacemanClient } from '@services/paceman'
import { politeFetch, plainFetch } from './http'

export const mcsr = createMcsrClient(politeFetch)
export const paceman = createPacemanClient(plainFetch)
