// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
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

        changeConnectionSettings(MockCredentialsManager.DUMMY_PROVIDER_IDENTIFIER, AwsRegionProvider.getInstance().defaultRegion())

        waitUntilStable()
    }

    fun changeRegionAndWait(region: AwsRegion) {
        changeRegion(region)
        waitUntilStable()
    }

    fun changeCredentialProviderAndWait(identifier: ToolkitCredentialsIdentifier?) {
        changeCredentialProvider(identifier)
        waitUntilStable()
    }

    private fun waitUntilStable() {
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

    val manager = MockProjectAccountSettingsManager.getInstance(project)
    val credentialsManager = MockCredentialsManager.getInstance()
    val oldActive = manager.connectionSettings()?.credentials
    try {
        println("Running using real credentials")

        val realCredentialsProvider = credentialsManager.addCredentials("RealCredentials", credentials)
        manager.changeCredentialProviderAndWait(realCredentialsProvider)

        return block.invoke()
    } finally {
        credentialsManager.reset()
        oldActive?.let {
            manager.changeCredentialProviderAndWait(credentialsManager.getCredentialIdentifierById(oldActive.id))
        }
    }
}
