/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getLogger } from '../logger'
import { isWeb } from '../extensionGlobals'

interface PerformanceMetrics {
    cpuUsage: number
    heapTotal: number
    duration: number
}

interface TestOptions {
    darwin?: Partial<PerformanceMetrics>
    win32?: Partial<PerformanceMetrics>
    linux?: Partial<PerformanceMetrics>
}

export interface PerformanceSpan<T> {
    value: T
    performance: PerformanceMetrics
}

export class PerformanceTracker {
    #startPerformance:
        | {
              cpuUsage: NodeJS.CpuUsage
              memory: number
              duration: [number, number]
          }
        | undefined

    constructor(private readonly name: string) {}

    static enabled(name: string, trackPerformance?: boolean): boolean {
        return name === 'function_call' && (trackPerformance ?? false) && !isWeb()
    }

    start() {
        this.#startPerformance = {
            cpuUsage: process.cpuUsage(),
            memory: process.memoryUsage().heapTotal,
            duration: process.hrtime(),
        }
    }

    stop(): PerformanceMetrics | undefined {
        if (this.#startPerformance) {
            const endCpuUsage = process.cpuUsage(this.#startPerformance?.cpuUsage)
            const userCpuUsage = endCpuUsage.user / 1000000
            const systemCpuUsage = endCpuUsage.system / 1000000

            const elapsedTime = process.hrtime(this.#startPerformance.duration)
            const duration = elapsedTime[0] + elapsedTime[1] / 1e9 // convert microseconds to seconds
            const usage = ((userCpuUsage + systemCpuUsage) / duration) * 100 // convert to percentage

            const endMemoryUsage = process.memoryUsage().heapTotal - this.#startPerformance?.memory
            const endMemoryUsageInMB = endMemoryUsage / (1024 * 1024) // converting bytes to MB

            return {
                cpuUsage: usage,
                heapTotal: endMemoryUsageInMB,
                duration,
            }
        } else {
            getLogger().debug(`PerformanceTracker: start performance not defined for ${this.name}`)
        }
    }
}

export function performanceTest(options: TestOptions, name: string, fn: () => Promise<void>): Mocha.Test
export function performanceTest(options: TestOptions, name: string, fn: () => void): Mocha.Test
export function performanceTest(options: TestOptions, name: string, fn: () => void | Promise<void>) {
    const testOption = options[process.platform as 'linux' | 'darwin' | 'win32']

    const performanceTracker = new PerformanceTracker(name)

    return it(name, async () => {
        performanceTracker.start()
        await fn()
        const metrics = performanceTracker.stop()
        if (!metrics) {
            assert.fail('Performance metrics not found')
        }
        assertPerformanceMetrics(metrics, name, testOption)
    })
}

function assertPerformanceMetrics(
    performanceMetrics: PerformanceMetrics,
    name: string,
    testOption?: Partial<PerformanceMetrics>
) {
    const expectedCPUUsage = testOption?.cpuUsage ?? 50
    const foundCPUUsage = performanceMetrics.cpuUsage

    assert(
        foundCPUUsage < expectedCPUUsage,
        `Expected total CPU usage for ${name} to be less than ${expectedCPUUsage}. Actual CPU usage was ${foundCPUUsage}`
    )

    const expectedMemoryUsage = testOption?.heapTotal ?? 400
    const foundMemoryUsage = performanceMetrics.heapTotal
    assert(
        foundMemoryUsage < expectedMemoryUsage,
        `Expected total memory usage for ${name} to be less than ${expectedMemoryUsage}. Actual memory usage was ${foundMemoryUsage}`
    )

    const expectedDuration = testOption?.duration ?? 5
    const foundDuration = performanceMetrics.duration
    assert(
        foundDuration < expectedDuration,
        `Expected total duration for ${name} to be less than ${expectedDuration}. Actual duration was ${foundDuration}`
    )
}
