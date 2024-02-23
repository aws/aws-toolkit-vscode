// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.jetbrains.rd.platform.codeWithMe.unattendedHost.metrics.Metric
import com.jetbrains.rd.platform.codeWithMe.unattendedHost.metrics.MetricType
import com.jetbrains.rd.platform.codeWithMe.unattendedHost.metrics.MetricsStatus
import com.jetbrains.rd.platform.codeWithMe.unattendedHost.metrics.providers.MetricProvider
import software.aws.toolkits.resources.message

class RebuildDevfileRequiredNotification : MetricProvider {
    override val id: String
        get() = "devfileRebuildRequired"

    override fun getMetrics(): Map<String, Metric> =
        if (DevfileWatcher.getInstance().hasDevfileChanged()) {
            mapOf(Pair("devfileRebuild", RebuildDevfileMetric))
        } else {
            mapOf()
        }

    // Adding MetricStatus as Danger instead of Warning, cause Warning is overriden by other notifications provided by the client
    object RebuildDevfileMetric : Metric(MetricType.OTHER, MetricsStatus.DANGER, true) {
        override fun toString(): String = message("caws.rebuild.workspace.notification")
    }
}
