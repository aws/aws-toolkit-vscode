/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getLogger } from '../logger'
import { isWeb } from '../extensionGlobals'
import { waitUntil } from '../utilities/timeoutUtils'

interface PerformanceMetrics {
    /**
     * The percentange of CPU time spent executing the user-space portions
     * of the application, (javascript and user-space libraries/dependencies)
     */
    userCpuUsage: number

    /**
     * The percentage CPU time spent executing system-level operations
     * related to the application, (file I/O, network, ipc, other kernel-space tasks)
     */
    systemCpuUsage: number
    heapTotal: number
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
              cpuUsage: NodeJS.CpuUsage
              memory: number
              duration: [number, number]
          }
        | undefined

    constructor(private readonly name: string) {}

    static enabled(name: string, trackPerformance: boolean): boolean {
        return name === 'function_call' && trackPerformance && !isWeb()
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

            const totalUserUsage = (userCpuUsage / duration) * 100
            const totalSystemUsage = (systemCpuUsage / duration) * 100

            const endMemoryUsage = process.memoryUsage().heapTotal - this.#startPerformance?.memory
            const endMemoryUsageInMB = endMemoryUsage / (1024 * 1024) // converting bytes to MB

            return {
                userCpuUsage: totalUserUsage,
                systemCpuUsage: totalSystemUsage,
                heapTotal: endMemoryUsageInMB,
                duration,
            }
        } else {
            getLogger().debug(`PerformanceTracker: start performance not defined for ${this.name}`)
        }
    }
}

interface PerformanceTest {
    setup: () => Promise<any>
    // function under performance test
    runTests: () => Promise<any>
    assertTests: (args: any) => any
}

/**
 * Generate a test suite that runs fn options.testRuns times and gets the average performance metrics of all the test runs
 */
export function performanceTest(options: TestOptions, name: string, fn: () => Promise<PerformanceTest>): Mocha.Suite
export function performanceTest(options: TestOptions, name: string, fn: () => PerformanceTest): Mocha.Suite
export function performanceTest(
    options: TestOptions,
    name: string,
    fn: () => PerformanceTest | Promise<PerformanceTest>
) {
    const testOption = options[process.platform as 'linux' | 'darwin' | 'win32']

    const totalTestRuns = options.testRuns ?? 10

    return describe(`${name} performance tests`, function () {
        let performanceTracker: PerformanceTracker | undefined
        const testRunMetrics: PerformanceMetrics[] = []

        beforeEach(async () => {
            this.timeout(60000)

            // Wait until the user/system cpu usage stabilizes on a lower amount
            const opt = await waitUntil(
                async () => {
                    const endCpuUsage = process.cpuUsage()
                    const userCpuUsage = endCpuUsage.user / 1000000
                    const systemCpuUsage = endCpuUsage.system / 1000000
                    // eslint-disable-next-line aws-toolkits/no-console-log
                    console.log(`userCpuUsage: ${userCpuUsage}, systemCpuUsage: ${systemCpuUsage}`)
                    return userCpuUsage < 15 && systemCpuUsage < 5
                },
                {
                    interval: 5000,
                    timeout: 60000,
                }
            )
            if (!opt) {
                assert.fail('CPU Usage failed to drop below 15/5')
            }

            performanceTracker = new PerformanceTracker(name)
        })

        for (let testRun = 1; testRun <= totalTestRuns; testRun++) {
            it(`${name} - test run ${testRun}`, async () => {
                const args = await fn()

                const setup = await args.setup()
                performanceTracker?.start()
                await args.runTests()
                const metrics = performanceTracker?.stop()
                if (!metrics) {
                    assert.fail('Performance metrics not found')
                }
                await args.assertTests(setup)
                // eslint-disable-next-line aws-toolkits/no-console-log
                console.log(`performanceMetrics: %O`, metrics)
                testRunMetrics.push(metrics)
            })
        }

        after(async () => {
            const totalUserCPUUsage =
                testRunMetrics.reduce((acc, metric) => acc + metric.userCpuUsage, 0) / testRunMetrics.length
            const totalSystemCPUUsage =
                testRunMetrics.reduce((acc, metric) => acc + metric.systemCpuUsage, 0) / testRunMetrics.length
            const totalMemoryUsage =
                testRunMetrics.reduce((acc, metric) => acc + metric.heapTotal, 0) / testRunMetrics.length
            const totalDuration =
                testRunMetrics.reduce((acc, metric) => acc + metric.duration, 0) / testRunMetrics.length

            assertPerformanceMetrics(
                {
                    userCpuUsage: totalUserCPUUsage,
                    systemCpuUsage: totalSystemCPUUsage,
                    duration: totalDuration,
                    heapTotal: totalMemoryUsage,
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
    const expectedUserCPUUsage = testOption?.userCpuUsage ?? 50
    const foundUserCPUUsage = performanceMetrics.userCpuUsage

    assert(
        foundUserCPUUsage < expectedUserCPUUsage,
        `Expected total user CPU usage for ${name} to be less than ${expectedUserCPUUsage}. Actual user CPU usage was ${foundUserCPUUsage}`
    )

    const expectedSystemCPUUsage = testOption?.systemCpuUsage ?? 20
    const foundSystemCPUUsage = performanceMetrics.systemCpuUsage

    assert(
        foundSystemCPUUsage < expectedUserCPUUsage,
        `Expected total system CPU usage for ${name} to be less than ${expectedSystemCPUUsage}. Actual system CPU usage was ${foundSystemCPUUsage}`
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
