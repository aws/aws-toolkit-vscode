// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.intellij

import org.gradle.api.provider.Property

abstract class ToolkitIntelliJExtension {
    enum class IdeFlavor {IC, IU, RD}

    abstract val ideFlavor: Property<IdeFlavor>
}
