/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getLogger } from '../logger'
import { isWeb } from '../extensionGlobals'

interface PerformanceMetrics {
    duration: number
}

interface TestOptions {
    darwin?: Partial<PerformanceMetrics>
    win32?: Partial<PerformanceMetrics>
    linux?: Partial<PerformanceMetrics>
    testRuns?: number
}

export interface PerformanceSpan<T> {
    value: T
    performance: PerformanceMetrics
}

export class PerformanceTracker {
    #startPerformance:
        | {
              duration: [number, number]
          }
        | undefined

    constructor(private readonly name: string) {}

    static enabled(name: string, trackPerformance: boolean): boolean {
        return name === 'function_call' && trackPerformance && !isWeb()
    }

    start() {
        this.#startPerformance = {
            duration: process.hrtime(),
        }
    }

    stop(): PerformanceMetrics | undefined {
        if (this.#startPerformance) {
            const elapsedTime = process.hrtime(this.#startPerformance.duration)
            const duration = elapsedTime[0] + elapsedTime[1] / 1e9 // convert microseconds to seconds

            return {
                duration,
            }
        } else {
            getLogger().debug(`PerformanceTracker: start performance not defined for ${this.name}`)
        }
    }
}

/**
 * Generate a test suite that runs fn options.testRuns times and gets the average performance metrics of all the test runs
 */
export function performanceTest(options: TestOptions, name: string, fn: () => Promise<void>): Mocha.Suite
export function performanceTest(options: TestOptions, name: string, fn: () => void): Mocha.Suite
export function performanceTest(options: TestOptions, name: string, fn: () => void | Promise<void>) {
    const testOption = options[process.platform as 'linux' | 'darwin' | 'win32']

    const totalTestRuns = options.testRuns ?? 5

    return describe(`${name} performance tests`, async () => {
        let performanceTracker: PerformanceTracker | undefined
        const testRunMetrics: PerformanceMetrics[] = []

        beforeEach(() => {
            performanceTracker = new PerformanceTracker(name)
            performanceTracker.start()
        })

        afterEach(() => {
            const metrics = performanceTracker?.stop()
            if (!metrics) {
                assert.fail('Performance metrics not found')
            }
            testRunMetrics.push(metrics)
        })

        for (let testRun = 1; testRun <= totalTestRuns; testRun++) {
            it(`${name} - test run ${testRun}`, async () => {
                await fn()
            })
        }

        after(async () => {
            const totalDuration =
                testRunMetrics.reduce((acc, metric) => acc + metric.duration, 0) / testRunMetrics.length

            assertPerformanceMetrics(
                {
                    duration: totalDuration,
                },
                name,
                testOption
            )
        })
    })
}

function assertPerformanceMetrics(
    performanceMetrics: PerformanceMetrics,
    name: string,
    testOption?: Partial<PerformanceMetrics>
) {
    const expectedDuration = testOption?.duration ?? 5
    const foundDuration = performanceMetrics.duration
    assert(
        foundDuration < expectedDuration,
        `Expected total duration for ${name} to be less than ${expectedDuration}. Actual duration was ${foundDuration}`
    )
}
