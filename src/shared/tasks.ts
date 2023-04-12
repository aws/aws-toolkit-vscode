/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Result } from './utilities/result'
import { AsyncResource } from 'async_hooks'
import { ToolkitError, UnknownError } from './errors'
import { AsyncLocalStorage } from './asyncLocalStorage'
import { isNonNullable, Mutable } from './utilities/tsUtils'
import { CancellationError, CancelToken } from './utilities/timeoutUtils'

interface TaskOptions {
    readonly name?: string
    readonly type?: string
    readonly metadata?: Record<string, any>
}

interface TaskWithOptions<T, U extends any[]> extends TaskOptions {
    readonly fn: (...args: U) => Promise<T>
}

interface BaseTask {
    readonly id: number
    readonly info: TaskInfo
    readonly state: 'stopped' | 'pending' | 'cancelling' | 'cancelled' | 'completed'
    dispose(): void
}

interface StoppedTask<T = unknown, U extends any[] = []> extends BaseTask {
    start(...args: U): PendingTask<T> 
    cancel(reason?: Error): void
    isPending(): this is PendingTask<T>
    isCompleted(): this is CompletedTask<T>
    isCancelled(): this is CancelledTask<T>
}

interface PendingTask<T = unknown> extends BaseTask {
    promise(): Promise<T>
    cancel(reason?: Error): void
    isCompleted(): this is CompletedTask<T>
    isCancelled(): this is CancelledTask<T>
}

interface CompletedTask<T = unknown> extends BaseTask{
    readonly result: Result<T>
}

interface CancelledTask<T = unknown> extends BaseTask {
    readonly result: Result<T>
    readonly reason?: unknown
}


export const isCancellable = <T, U extends any[]>(task: Task<T, U>): task is StoppedTask<T, U> | PendingTask<T> => {
    return task.state === 'pending' || task.state === 'stopped'
}

export const isCompleted = <T, U extends any[]>(task: Task<T, U>): task is CompletedTask<T> => {
    return task.state === 'completed'
}

// Discriminated union types are not used here because Typescript there's
// no way to invalidate Typescript's control-flow analysis. Some of the
// methods on these interfaces cause `state` to mutate, so `const` types
// are misleading.
//
// The current implementation makes it so these interfaces accumulate as
// tasks change state. It's not quite as nice as discriminated union types
// but it is an accurate representation.
export type Task<T = unknown, U extends any[] = []> =
    | StoppedTask<T, U>
    | PendingTask<T>
    | CompletedTask<T>
    | CancelledTask<T>

interface ExecutionContext {
    readonly taskId: Task['id']
    readonly cancelToken: CancelToken
}

interface TaskInfo extends TaskOptions {
    readonly state: Task['state']
    readonly parent?: Task['id']
    readonly children: Task['id'][]
    readonly fulfilled: boolean
}

type TaskOrOptions<T, U extends any[]> = ((...args: U) => Promise<T>) | TaskWithOptions<T, U>

// TODO: use these types if we can find a way to make type-safe discriminated union interfaces that mutate
// type IntersectDiscriminatedType<T, U extends keyof T> = (T extends any ? (x: Omit<T, U>) => any : never) extends (x: infer U) => any ? U : never
// type Merged<T = unknown, U extends any[] = []> = IntersectDiscriminatedType<Task<T, U>, 'state'> & Pick<Task, 'state'>

export class Tasks {
    #counter = 0
    #onDidAddTask?: vscode.EventEmitter<Task>
    #onDidRemoveTask?: vscode.EventEmitter<Task>
    #onDidChangeTaskState?: vscode.EventEmitter<Task>
    readonly #tasks = new Map<Task['id'], Task & { info: TaskInfo }>
    readonly #context = new AsyncLocalStorage<ExecutionContext>()

    public get context() {
        return this.#context.getStore()    
    }

    public get currentTask() {
        const id = this.context?.taskId
        return id !== undefined ? this.getTask(id) : undefined
    }

    public get onDidAddTask() {
        this.#onDidAddTask ??= new vscode.EventEmitter()
        return this.#onDidAddTask.event
    }

    public get onDidRemoveTask() {
        this.#onDidRemoveTask ??= new vscode.EventEmitter()
        return this.#onDidRemoveTask.event
    }

    public get onDidChangeTaskState() {
        this.#onDidChangeTaskState ??= new vscode.EventEmitter()
        return this.#onDidChangeTaskState.event
    }

    public createTask<T, U extends any[]>(fn: (...args: U) => Promise<T>): StoppedTask<T, U>
    public createTask<T, U extends any[]>(opt: TaskWithOptions<T, U>): StoppedTask<T, U>
    public createTask<T, U extends any[]>(taskOrOpt: TaskOrOptions<T, U>): StoppedTask<T, U> {
        const opt = typeof taskOrOpt === 'function' ? {} : taskOrOpt
        const fn = typeof taskOrOpt === 'function' ? taskOrOpt : taskOrOpt.fn
        const cancelToken = new CancelToken()
        const taskInfo = {
            ...opt,
            children: [],
            fulfilled: false,
        }

        const setResult = (result: Result<T>) => (task as Mutable<CompletedTask<T>>).result ??= result
        const setReason = (reason?: unknown) => (task as Mutable<CancelledTask<T>>).reason = reason
        const setPromise = (promise: Promise<T>) => (task as Mutable<PendingTask<T>>).promise = () => promise
        const chainReason = (reason?: unknown) => new ToolkitError(`Task "${this.getTaskLabel(task)}" cancelled`, {
            cause: reason ? UnknownError.cast(reason) : undefined,
        })

        cancelToken.onCancellationRequested(event => {
            if (!isCancellable(task)) {
                return
            }

            setReason(event.reason)    
            this.updateInfo(task.id, { state: 'cancelling' })
            
            for (const child of this.getChildren(task)) {
                if (isCancellable(child)) {
                    child.cancel(event.reason)
                }
            }
        })

        const task = {
            id: this.#counter++,
            info: taskInfo,
            state: 'stopped',
            dispose: () => cancelToken.dispose(), // TODO: potentially force sweep on disposed tasks
            cancel: cancelToken.cancel.bind(cancelToken),
            isPending: () => task.state === 'pending',
            isCompleted: () => task.state === 'completed',
            isCancelled: () => task.state === 'cancelled',
            start: (...args: Parameters<typeof fn>) => {
                if ((task as PendingTask<T>).promise !== undefined) {
                    return task
                }

                const throwIfCancelled = () => {
                    if (cancelToken.isCancellationRequested) {
                        setResult(Result.err(cancelToken.reason))
                        this.updateInfo(task.id, { fulfilled: true, state: 'cancelled' })
    
                        throw chainReason(cancelToken.reason)
                    }
                }

                if (this.context) {
                    if (this.context.cancelToken.isCancellationRequested) {
                        const message = `Parent task "${this.context.taskId}" cancelled`
                        cancelToken.cancel(new ToolkitError(message, { cause: this.context.cancelToken.reason }))
                    } 

                    throwIfCancelled()
                    this.link(task, this.context)
                } else {
                    throwIfCancelled()
                    this.updateInfo(task.id, { state: 'pending' })
                }

                const ctx = { taskId: task.id, cancelToken }
                const promise = this.#context.run(ctx, (fn as (...args: any[]) => Promise<T>), ...args)
                    .then(val => {
                        setResult(Result.ok(val))
                        throwIfCancelled()

                        return val
                    })
                    .catch(err => {
                        setResult(Result.err(err))

                        if (err !== cancelToken.reason) {
                            if (err instanceof CancellationError || (err instanceof ToolkitError && err.cancelled)) {
                                cancelToken.cancel(err)
                            } else {
                                throwIfCancelled()
                            }    
                        }

                        throw err
                    })
                    .finally(() => {
                        const finalState = task.state === 'pending' ? 'completed' : 'cancelled'
                        this.updateInfo(task.id, { fulfilled: true, state: finalState })
                        this.sweep(task.id)
                    }) 

                setPromise(promise)
                return task
            }
        } as unknown as Task<T, U>
            
        this.addTask(task)
        return task as StoppedTask<T, U>
    }

    public getChildren(task: Pick<Task, 'id'>) {
        const children = this.getTask(task.id)?.info.children ?? []
        
        return children.map(child => this.getTask(child)).filter(isNonNullable)
    }

    public getAllTasks() {        
        return Array.from(this.#tasks.values())
    }

    public getRootTasks(): Task[] {
        const roots = new Map(this.#tasks.entries())
        const allChildren = Array.from(this.#tasks.values()).map(t => t.info.children)
        for (const children of allChildren) {
            children.forEach(c => roots.delete(c))
        }

        return Array.from(roots.values())
    }

    public dispose() {
        vscode.Disposable.from(
            ...this.getAllTasks(),
            ...[this.#onDidAddTask, this.#onDidRemoveTask, this.#onDidChangeTaskState].filter(isNonNullable)
        ).dispose()
    }

    private addTask(task: Task & { info: TaskInfo }) {
        this.#tasks.set(task.id, task)
        this.#onDidAddTask?.fire(task)
    }

    private getTask(id: Task['id']) {
        return this.#tasks.get(id)
    }
    
    private getTaskLabel(task: Pick<Task, 'id'>) {
        const opt = this.getTask(task.id)?.info

        return opt?.name ? `${opt.name} (${task.id})` : `${task.id}`
    }

    private updateInfo(id: Task['id'], info: Partial<TaskInfo>) {
        const task = this.getTask(id)
        if (task === undefined) {
            return
        }
    
        const oldState = task.info.state
        task.info = { ...task.info, ...info }
        if (info.state !== undefined) {
            ;(task as Mutable<typeof task>).state = info.state
            if (info.state !== oldState) {
                this.#onDidChangeTaskState?.fire(task)
            }
        }
    }

    private sweep(id: Task['id']) {
        const task = this.getTask(id)
        if (!task?.info.fulfilled || this.getChildren(task).length > 0) {
            return
        }

        task.dispose()
        this.#tasks.delete(id)

        if (task.info.parent !== undefined) {
            this.sweep(task.info.parent)
        }

        this.#onDidRemoveTask?.fire(task)
    }

    private link(task: Task, ctx: ExecutionContext) {
        this.updateInfo(task.id, { parent: ctx.taskId, state: 'pending' })
        this.getTask(ctx.taskId)?.info.children.push(task.id)
    }

    static #instance: Tasks
    public static get instance() {
        return this.#instance ??= new this()
    }
}

export function getExecutionContext(service = Tasks.instance) {
    return service.context
}

export function getExecutionContextOrThrow(service = Tasks.instance) {
    const ctx = service.context
    if (!ctx) {
        throw new Error('Tried to get the current execution context without being in a task')
    }
    return ctx
}

export function isCancellationRequested() {
    return Tasks.instance.context?.cancelToken?.isCancellationRequested
}

export function onCancellationRequested(fn: () => unknown) {
    const token = Tasks.instance.context?.cancelToken
    if (token) {
        return token.onCancellationRequested(fn)
    }
}

export function isRootTask(service = Tasks.instance) {
    const task = service.currentTask

    return task === undefined
}

export function runTask<T>(task: TaskWithOptions<T, []>): Promise<T>
export function runTask<T>(name: string, fn: () => Promise<T>): Promise<T>
export function runTask<T>(taskOrName: string | TaskWithOptions<T, []>, fn?: () => Promise<T>): Promise<T> {
    const task = typeof taskOrName === 'string' ? {
        name: taskOrName,
        fn: fn!,
    } : taskOrName
        
    return Tasks.instance.createTask(task).start().promise()
}

export function bindToOuterScope<T extends (...args: any[]) => any>(fn: T): T {
    return AsyncResource.bind(fn)
}
