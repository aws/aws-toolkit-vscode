// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

object CawsEndpoints {
    const val CAWS_DOCS = "https://docs.aws.amazon.com/codecatalyst/latest/userguide/welcome.html"
    const val CAWS_DEV_ENV_MARKETING = "https://codecatalyst.aws/explore/dev-environments"
    const val TOOLKIT_CAWS_DOCS = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/codecatalyst-service.html"

    const val CAWS_PROD_API = "https://public.codecatalyst.global.api.aws"
    private const val CAWS_PROD_CONSOLE_BASE = "https://codecatalyst.aws/"

    // TODO: fix this heuristic
    const val CAWS_GIT_PATTERN = "codecatalyst.aws"

    object ConsoleFactory {
        fun baseUrl() = CAWS_PROD_CONSOLE_BASE
        private fun space(space: String) = baseUrl() + "spaces/$space/"
        private fun project(project: CawsProject) = space(project.space) + "projects/${project.project}"

        fun marketing() = baseUrl() + "explore"
        fun pricing() = baseUrl() + "explore/pricing"
        fun userHome() = baseUrl() + "user/view"

        fun devWorkspaceHome(project: CawsProject) = project(project) + "/dev-environments"
        fun projectHome(project: CawsProject) = project(project) + "/view"
        fun repositoryHome(project: CawsProject) = project(project) + "/source-repositories"
    }
}
