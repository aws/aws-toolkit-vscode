// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.changelog.ChangeType
import software.aws.toolkits.gradle.changelog.tasks.CreateRelease
import software.aws.toolkits.gradle.changelog.tasks.NewChange

tasks.register<CreateRelease>("createRelease")

tasks.register<NewChange>("newChange") {
    description = "Creates a new change entry for inclusion in the Change Log"
}

tasks.register<NewChange>("newFeature") {
    description = "Creates a new feature change entry for inclusion in the Change Log"

    defaultChangeType = ChangeType.FEATURE
}

tasks.register<NewChange>("newBugFix") {
    description = "Creates a new bug-fix change entry for inclusion in the Change Log"

    defaultChangeType = ChangeType.BUGFIX
}
