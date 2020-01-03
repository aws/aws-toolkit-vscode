// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.spinUntil
import java.time.Duration

class MockProjectAccountSettingsManager(project: Project) : ProjectAccountSettingsManager(project) {
    init {
        reset()
    }

    fun reset() {
        recentlyUsedRegions.clear()
        recentlyUsedProfiles.clear()

        changeConnectionSettings(MockCredentialsManager.DUMMY_PROVIDER, AwsRegionProvider.getInstance().defaultRegion())

        spinUntil(Duration.ofSeconds(10)) { connectionState == ConnectionState.VALID }
    }

    override suspend fun validate(credentialsProvider: ToolkitCredentialsProvider, region: AwsRegion): Boolean = withContext(Dispatchers.IO) {
        true
    }

    companion object {
        fun getInstance(project: Project): MockProjectAccountSettingsManager =
            ServiceManager.getService(project, ProjectAccountSettingsManager::class.java) as MockProjectAccountSettingsManager
    }
}

fun <T> runUnderRealCredentials(project: Project, block: () -> T): T {
    val credentials = DefaultCredentialsProvider.create().resolveCredentials()

    val realCredentials = object : ToolkitCredentialsProvider() {
        override val id = "RealCredentials"
        override val displayName = "RealCredentials"
        override fun resolveCredentials() = credentials
    }

    val manager = MockProjectAccountSettingsManager.getInstance(project)
    val credentialsManager = MockCredentialsManager.getInstance()
    val oldActive = manager.connectionSettings()?.credentials
    try {
        println("Running using real credentials")
        credentialsManager.addCredentials("RealCredentials", credentials)
        manager.changeCredentialProvider(realCredentials)
        return block.invoke()
    } finally {
        credentialsManager.reset()
        oldActive?.let {
            manager.changeCredentialProvider(it)
        }
    }
}
