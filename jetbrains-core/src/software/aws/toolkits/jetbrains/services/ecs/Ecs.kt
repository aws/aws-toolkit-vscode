// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

import com.intellij.util.containers.nullize
import software.amazon.awssdk.services.ecs.EcsClient
import software.aws.toolkits.core.utils.wait
import java.time.Duration

fun EcsClient.waitForServicesStable(
    cluster: String,
    vararg services: String,
    waitForMissingServices: Boolean = false,
    attempts: Int = 60,
    delay: Duration = Duration.ofSeconds(10)
) {
    wait(
        call = {
            describeServices {
                it.cluster(cluster)
                it.services(*services)
            }
        },
        success = { response ->
            // return true when there are no non-stable services
            response.services().size != 0 &&
            response.services().map { service ->
                // service is stable if there is only a single deployment and the running count matches desired
                service.deployments().size == 1 && service.runningCount() == service.desiredCount()
            }.all { it }
        },
        fail = {
            it.failures().mapNotNull { failure ->
                if (waitForMissingServices && failure.reason() == "MISSING") {
                    return@mapNotNull null
                }
                failure.toString()
            }.nullize()?.joinToString(System.lineSeparator())
        },
        failByException = { it.message },
        attempts = attempts,
        delay = delay
    )
}

fun EcsClient.waitForServicesInactive(
    cluster: String,
    vararg services: String,
    attempts: Int = 60,
    delay: Duration = Duration.ofSeconds(10)
) {
    wait(
        call = {
            describeServices {
                it.cluster(cluster)
                it.services(*services)
            }
        },
        success = { response ->
            response.services().size != 0 &&
                response.services().map { service ->
                    // service is stable if there is only a single deployment and the running count matches desired
                    service.status() == "INACTIVE"
                }.all { it }
        },
        fail = {
            it.failures().mapNotNull { failure -> failure.toString() }.nullize()?.joinToString(System.lineSeparator())
        },
        failByException = { it.message },
        attempts = attempts,
        delay = delay
    )
}
