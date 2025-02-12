/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getLogger } from '../logger/logger'

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

interface PerformanceTestFunction<TSetup, TExecute> {
    // anything you want setup (stubs, etc)
    setup: () => Promise<TSetup>

    // function under performance test
    execute: (args: TSetup) => Promise<TExecute>

    // anything you want to verify (assertions, etc)
    verify: (setup: TSetup, execute: TExecute) => Promise<void> | void
}

/**
 * Generate a test suite that runs fn options.testRuns times and gets the average performance metrics of all the test runs
 */
export function performanceTest<TSetup, TExecute>(
    options: TestOptions,
    name: string,
    fn: () => PerformanceTestFunction<TSetup, TExecute>
) {
    const testOption = options[process.platform as 'linux' | 'darwin' | 'win32']

    const totalTestRuns = options.testRuns ?? 10
    // TODO: unskip this once flakiness is reduced.
    return describe.skip(`${name} performance tests`, () => {
        let performanceTracker: PerformanceTracker | undefined
        const testRunMetrics: PerformanceMetrics[] = []

        beforeEach(async () => {
            const startCpuUsage = process.cpuUsage()
            const userCpuUsage = startCpuUsage.user / 1000000
            const systemCpuUsage = startCpuUsage.system / 1000000
            getLogger().info(`Starting CPU usage for "${name}" - User: ${userCpuUsage}%, System: ${systemCpuUsage}%`)

            performanceTracker = new PerformanceTracker(name)
        })

        for (let testRun = 1; testRun <= totalTestRuns; testRun++) {
            it(`${name} - test run ${testRun}`, async () => {
                const { setup, execute, verify } = fn()

                const setupResp = await setup()

                performanceTracker?.start()
                const execResp = await execute(setupResp)
                const metrics = performanceTracker?.stop()
                if (!metrics) {
                    assert.fail('Performance metrics not found')
                }

                // log these messages for now so we can better understand flakiness
                getLogger().info(`performanceMetrics: %O`, metrics)
                testRunMetrics.push(metrics)

                await verify(setupResp, execResp)
            })
        }

        after(async () => {
            // use median since its more resistant to outliers
            const middle = Math.floor(testRunMetrics.length / 2)
            const medianUserCPUUsage = [...testRunMetrics].sort((a, b) => a.userCpuUsage - b.userCpuUsage)[middle]
                .userCpuUsage
            const medianTotalSystemCPUUsage = [...testRunMetrics].sort((a, b) => a.systemCpuUsage - b.systemCpuUsage)[
                middle
            ].systemCpuUsage
            const medianTotalMemoryUsage = [...testRunMetrics].sort((a, b) => a.heapTotal - b.heapTotal)[middle]
                .heapTotal
            const medianTotalDuration = [...testRunMetrics].sort((a, b) => a.duration - b.duration)[middle].duration

            // log these messages for now so we can better understand flakiness
            getLogger().info('Median performance metrics: %O', {
                userCpuUsage: medianUserCPUUsage,
                systemCpuUsage: medianTotalSystemCPUUsage,
                heapTotal: medianTotalMemoryUsage,
                duration: medianTotalDuration,
            })

            assertPerformanceMetrics(
                {
                    userCpuUsage: medianUserCPUUsage,
                    systemCpuUsage: medianTotalSystemCPUUsage,
                    duration: medianTotalDuration,
                    heapTotal: medianTotalMemoryUsage,
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

export function getEqualOSTestOptions(testOptions: Partial<PerformanceMetrics>): Partial<TestOptions> {
    return {
        linux: testOptions,
        darwin: testOptions,
        win32: testOptions,
    }
}
