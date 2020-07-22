// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import org.gradle.api.Plugin
import org.gradle.api.Project
import toolkits.gradle.changelog.tasks.CreateRelease
import toolkits.gradle.changelog.tasks.NewChange

@Suppress("unused") // Plugin is created by buildSrc/build.gradle
class ChangeLogPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        project.tasks.register("createRelease", CreateRelease::class.java) {
            it.description = "Generates a release entry from unreleased changelog entries"
        }

        project.tasks.register("newChange", NewChange::class.java) {
            it.description = "Creates a new change entry for inclusion in the Change Log"
        }

        project.tasks.register("newFeature", NewChange::class.java) {
            it.description = "Creates a new feature change entry for inclusion in the Change Log"
            it.defaultChangeType = ChangeType.FEATURE
        }

        project.tasks.register("newBugFix", NewChange::class.java) {
            it.description = "Creates a new bug-fix change entry for inclusion in the Change Log"
            it.defaultChangeType = ChangeType.BUGFIX
        }
    }
}
