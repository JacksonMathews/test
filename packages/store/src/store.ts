import { atom, createStore } from 'jotai'
import { User } from '@penx/model'
import { commands } from './constants'
import { AppStore } from './stores/AppStore'
import { CatalogueStore } from './stores/CatalogueStore'
import { EditorStore } from './stores/EditorStore'
import { NodeStore } from './stores/NodeStore'
import { RouterStore } from './stores/RouterStore'
import { SpaceStore } from './stores/SpaceStore'
import { SyncStore } from './stores/SyncStore'
import { Command, ExtensionStore } from './types'

export const commandsAtom = atom<Command[]>(commands)

export const extensionStoreAtom = atom<ExtensionStore>({})

export const userAtom = atom<User>({} as User)

export const userIdAtom = atom('')

const baseStore = createStore()

export const store = Object.assign(baseStore, {
  get: baseStore.get,
  set: baseStore.set,

  get app() {
    return new AppStore(this)
  },

  get router() {
    return new RouterStore(this)
  },

  get editor() {
    return new EditorStore(this)
  },

  get space() {
    return new SpaceStore(this)
  },

  get node() {
    return new NodeStore(this)
  },

  get catalogue() {
    return new CatalogueStore(this)
  },

  get sync() {
    return new SyncStore(this)
  },

  getUserId() {
    return store.get(userIdAtom)
  },

  setUserId(userId: string) {
    return store.set(userIdAtom, userId)
  },

  getUser() {
    return store.get(userAtom)
  },

  setUser(user: User) {
    return store.set(userAtom, user)
  },
})
