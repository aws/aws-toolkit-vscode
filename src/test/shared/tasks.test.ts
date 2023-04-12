/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { bindToOuterScope, Task, Tasks } from '../../shared/tasks'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { captureEvent, EventCapturer } from '../testUtil'

describe('Tasks', function () {
    let tasks: Tasks
    let addedTasks: EventCapturer<Task>
    let removedTasks: EventCapturer<Task>
    let updatedTasks: EventCapturer<Task>

    beforeEach(function () {
        tasks = new Tasks()
        addedTasks = captureEvent(tasks.onDidAddTask)
        removedTasks = captureEvent(tasks.onDidAddTask)
        updatedTasks = captureEvent(tasks.onDidChangeTaskState)
    })

    afterEach(function () {
        tasks?.dispose()
        addedTasks.dispose()
        removedTasks.dispose()
        updatedTasks.dispose()
    })

    function createTestTask<T = void>() {
        let resolve!: (val: T) => void
        let reject!: (err?: any) => void
        
        const promise = new Promise<T>((resolve_, reject_) => {
            resolve = resolve_
            reject = reject_
        })

        const task = tasks.createTask(() => promise)

        return Object.assign(task, { resolve, reject })
    }

    it('can create a new task in the "stopped" state', function () {
        const task = tasks.createTask(async () => { })
        assert.strictEqual(task.state, 'stopped')  
    })

    it('starts the task by executing the callback', async function () {
        const task = tasks.createTask(async () => 'hello').start()
        assert.strictEqual(task.state, 'pending')  
        assert.strictEqual(await task.promise(), 'hello')
    })

    it('sets a completed state when the task finishes and was not cancelled', async function () {
        const task = tasks.createTask(async () => 'hello').start()
        await task.promise()
        assert.strictEqual(task.state, 'completed')  
    })

    it('is idempotent with respect to `start`', async function () {
        let counter = 0
        const task = tasks.createTask(async () => counter++)
        const [t1, t2] = [task.start(), task.start()]
        await Promise.all([t1.promise(), t2.promise()])
        assert.strictEqual(counter, 1)
    })

    it('returns the same task when calling `start` on a pending task', async function () {
        const task = tasks.createTask(async () => 'hello')
        const [t1, t2] = [task.start(), task.start()]
        assert.strictEqual(t1, t2)
    })

    it('does not swallow errors', async function () {
        const task = tasks.createTask(async () => { throw new Error() }).start()
        await assert.rejects(task.promise())
    })

    describe('async context', function () {
        function createContextCheckTask() {
            const task = tasks.createTask(async () => { 
                assert.strictEqual(tasks.currentTask, task)
                return 
            })

            return task
        }

        it('tracks the current task in independent async contexts', async function () {
            const task1 = createContextCheckTask().start()
            const task2 = createContextCheckTask().start()
            await Promise.all([task1.promise(), task2.promise()])
        })
    
        it('tracks the current task in nested async contexts', async function () {
            const task1 = tasks.createTask(async () => {     
                const task2 = createContextCheckTask().start()
                const task3 = createContextCheckTask().start()
    
                await task2.promise()
                assert.strictEqual(tasks.currentTask, task1)
                await task3.promise()
    
                return 
            }).start()
            
            await task1.promise()
        })    

        it('marks nested tasks as children of the parent', async function () {
            const task1 = tasks.createTask(async () => {     
                const task2 = createContextCheckTask().start()
                const task3 = createContextCheckTask().start()
                assert.ok(tasks.currentTask)
                assert.deepStrictEqual(tasks.getChildren(tasks.currentTask).map(t => t.id), [task2.id, task3.id])

                await Promise.all([task2.promise(), task3.promise()])
                return
            }).start()
            
            await task1.promise()
        })    
    })

    describe('completed tasks', function () {
        async function runToCompletion(fn: () => Promise<unknown>) {
            const task = tasks.createTask(fn).start()
            await task.promise().catch(() => { })
            
            return task
        }

        it('provides the result', async function () {
            const task = await runToCompletion(async () => 'hello')
            assert.ok(task.isCompleted())
            assert.strictEqual(task.result.unwrap(), 'hello')
        })

        it('provides the result for completed but failed tasks', async function () {
            const testError = new Error('hello')
            const task = await runToCompletion(async () => { throw testError })
            assert.ok(task.isCompleted())
            assert.throws(() => task.result.unwrap(), testError)
        })

        it('does not remove the task if it still has children tasks', async function () {
            const child = createTestTask()
            await runToCompletion(async () => child.start())
            assert.strictEqual(tasks.getAllTasks().length, 2)
            child.resolve()
            await child.start().promise()
            assert.strictEqual(tasks.getAllTasks().length, 0)
        })
    })

    describe('cancellations', function () {
        it('results in a rejected promise when cancelled', async function () {
            const task = tasks.createTask(async () => 'hello').start()
            task.cancel()
            await assert.rejects(task.promise())
        })

        it('respects cancellations that occur before the task was started', function () {
            const task = tasks.createTask(async () => 'hello')
            task.cancel()
            assert.throws(() => task.start())
        })

        it('stores the cancel reason on the task', async function () {
            const reason = new Error('goodbye')
            const task = tasks.createTask(async () => 'hello').start()
            task.cancel(reason)
            await assert.rejects(task.promise())
            assert.ok(task.isCancelled())
            assert.strictEqual(task.reason, reason)
        })

        it('throws if starting a cancelled task', function () {
            const task = tasks.createTask(async () => 'hello')
            task.cancel()
            assert.throws(() => task.start())
            assert.ok(task.isCancelled())
        })

        it('provides a cancel token for cancelling the current task', async function () {
            const task = tasks.createTask(async () => {
                assert.ok(tasks.context?.cancelToken)
                tasks.context.cancelToken.cancel()
            })
            await assert.rejects(() => task.start().promise())
            assert.ok(task.isCancelled())
        })

        it('ignores additional cancel reasons beyond the first', async function () {
            const reason1 = new Error('1')
            const reason2 = new Error('2')
            const task = tasks.createTask(async () => 'hello').start()
            task.cancel(reason1)
            task.cancel(reason2)
            await assert.rejects(task.promise())
            assert.ok(task.isCancelled())
            assert.strictEqual(task.reason, reason1)
        })

        it('uses cancel reasons as the cause for cancellation', async function () {
            const reason = new Error('goodbye')
            const task = tasks.createTask(async () => 'hello').start()
            task.cancel(reason)
            const err = await task.promise().catch(e => e)
            assert.ok(err instanceof ToolkitError)
            assert.strictEqual(err.cause, reason)
        })

        it('propagates cancels to cancel tokens', async function () {
            const task = tasks.createTask({
                name: 'test',
                fn: async () => {
                    assert.ok(tasks.context?.cancelToken)
                    const event = await captureEvent(tasks.context.cancelToken.onCancellationRequested).next()
                    assert.strictEqual(event.reason.message, 'Task "test" cancelled')
                },
            }).start()
            task.cancel()
            await assert.rejects(() => task.promise())
            assert.ok(task.isCancelled())
        })

        it('propagates cancels to children tasks that have started', async function () {
            const parent = tasks.createTask(async () => {
                const child = tasks.createTask(async () => 'hello').start()
                parent.cancel()
                await assert.rejects(child.promise())
    
                return 'passed'
            })

            await assert.rejects(parent.start().promise())
            assert.ok(parent.isCancelled())
            assert.strictEqual(parent.result.unwrap(), 'passed')
        })

        it('propagates cancels to children tasks that have not started', async function () {
            const child = tasks.createTask(async () => 'hello')     // task 0
            const parent = tasks.createTask(async () => {           // task 1
                parent.cancel()
                await child.start().promise()    
            })

            await assert.rejects(parent.start().promise(), /Task "0" cancelled/)
            assert.ok(child.isCancelled())
            assert.ok(parent.isCancelled())
            assert.ok(child.reason instanceof ToolkitError)
            assert.strictEqual(child.reason.message, 'Parent task "1" cancelled')
        })

        describe('cancel propagation from within task', function () {
            async function runTaskWithError(err: Error) {
                const task = tasks.createTask(async () => { throw err }).start()
                const result = await task.promise().catch(e => e)

                return { task, result }
            }
    
            it('treats the task as cancelled if it throws a cancellation error', async function () {
                const reason = new CancellationError('user')
                const { task, result } = await runTaskWithError(reason)
                assert.strictEqual(result, reason)
                assert.ok(task.isCancelled())
            })
    
            it('treats the task as cancelled if it throws a cancelled `ToolkitError`', async function () {
                const reason = new ToolkitError('test', { cancelled: true })
                const { task, result } = await runTaskWithError(reason)
                assert.strictEqual(result, reason)
                assert.ok(task.isCancelled())
            })
        })
    })

    describe('execution scopes', function () {
        let emitter: vscode.EventEmitter<void>
        let capturedTasks: Tasks['currentTask'][] 

        beforeEach(function () {
            emitter = new vscode.EventEmitter<void>()
            capturedTasks = []
        })

        it('uses the scope of the event sender by default', async function () {
            const task1 = tasks.createTask(async () => {
                emitter.event(() => capturedTasks.push(tasks.currentTask))
            })
            const task2 = tasks.createTask(async () => emitter.fire())
            await Promise.all([task1.start().promise(), task2.start().promise()])
            assert.deepStrictEqual(capturedTasks, [task2])
        })

        it('uses the scope of the event receiver if `bindToOuterScope` is applied', async function () {
            const task1 = tasks.createTask(async () => {
                emitter.event(bindToOuterScope(() => capturedTasks.push(tasks.currentTask)))
            })
            const task2 = tasks.createTask(async () => emitter.fire())
            await Promise.all([task1.start().promise(), task2.start().promise()])
            assert.deepStrictEqual(capturedTasks, [task1])
        })
    })

    describe('events', function () {
        let addedTasks: EventCapturer<Task>
        let removedTasks: EventCapturer<Task>
        let updatedTasks: EventCapturer<Task>

        beforeEach(function () {
            addedTasks = captureEvent(tasks.onDidAddTask)
            removedTasks = captureEvent(tasks.onDidAddTask)
            updatedTasks = captureEvent(tasks.onDidChangeTaskState)
        })

        afterEach(function () {
            addedTasks.dispose()
            removedTasks.dispose()
            updatedTasks.dispose()
        })

        it('emits an event when creating a task', async function () {
            const task = tasks.createTask(async () => 'hello')
            assert.strictEqual(await addedTasks.next(), task)
        })

        it('emits an event when removing a task', async function () {
            const task = tasks.createTask(async () => 'hello').start()
            await task.promise()
            assert.strictEqual(await removedTasks.next(), task)
        })

        it('removes children tasks before parent tasks', async function () {
            const child = tasks.createTask(async () => 'hello')
            const parent = tasks.createTask(async () => { await child.start().promise() }).start()
            await parent.promise()
            assert.strictEqual(await removedTasks.next(), child)
            assert.strictEqual(await removedTasks.next(), parent)
        })
    
        it('emits events as the task changes state', async function () {
            tasks.createTask(async () => 'hello').start()
            assert.strictEqual((await updatedTasks.next()).state, 'pending')
            assert.strictEqual((await updatedTasks.next()).state, 'completed')
        })

        it('handles cancellations', async function () {
            const task = tasks.createTask(async () => 'hello').start()
            assert.strictEqual((await updatedTasks.next()).state, 'pending')
            task.cancel()
            assert.strictEqual((await updatedTasks.next()).state, 'cancelling')
            assert.strictEqual((await updatedTasks.next()).state, 'cancelled')
        })
    })
})