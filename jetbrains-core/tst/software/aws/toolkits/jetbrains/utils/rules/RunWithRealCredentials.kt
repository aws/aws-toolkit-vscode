// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.DefaultAwsResourceCache
import software.aws.toolkits.jetbrains.core.MockClientManager
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.DefaultAwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.DefaultCredentialManager
import software.aws.toolkits.jetbrains.core.credentials.profiles.DEFAULT_PROFILE_ID
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileCredentialProviderFactory
import software.aws.toolkits.jetbrains.core.credentials.waitUntilConnectionStateIsStable
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class RunWithRealCredentials : TestRule {
    /**
     * Marks a unit test, or unit test class, as requiring AWS credentials to run. Will always use the default AWS profile, and by default us-west-2
     */
    annotation class RequiresRealCredentials

    private val projectSupplier: () -> Project

    constructor(projectRule: ProjectRule) : super() {
        this.projectSupplier = { projectRule.project }
    }

    constructor(projectRule: CodeInsightTestFixtureRule) : super() {
        this.projectSupplier = { projectRule.project }
    }

    override fun apply(base: Statement, description: Description): Statement = if (description.getAnnotation(RequiresRealCredentials::class.java) == null &&
        description.testClass.getAnnotation(RequiresRealCredentials::class.java) == null
    ) {
        base
    } else {
        object : Statement() {
            override fun evaluate() {
                val disposable = Disposer.newDisposable()
                try {
                    val project = projectSupplier.invoke()

                    MockClientManager.useRealImplementations(disposable)

                    // ProfileCredentialProviderFactory is designed to be a singleton, so replace it with a new instance
                    ExtensionTestUtil.maskExtensions(DefaultCredentialManager.EP_NAME, listOf(ProfileCredentialProviderFactory()), disposable)

                    ApplicationManager.getApplication().replaceService(CredentialManager::class.java, DefaultCredentialManager(), disposable)
                    // suppress beacuse otherwise we have to declare experimental coroutines on every single test where we use the rule
                    @Suppress("EXPERIMENTAL_API_USAGE")
                    ApplicationManager.getApplication().replaceService(AwsResourceCache::class.java, DefaultAwsResourceCache(), disposable)
                    project.replaceService(AwsConnectionManager::class.java, DefaultAwsConnectionManager(project), disposable)

                    val credentialIdentifier = CredentialManager.getInstance().getCredentialIdentifierById(DEFAULT_PROFILE_ID)
                        ?: throw IllegalStateException("RunWithRealCredentials requires a default AWS profile!")
                    val regionId = System.getenv().getOrDefault("AWS_DEFAULT_REGION", "us-west-2")
                    val region = AwsRegionProvider.getInstance()[regionId] ?: throw IllegalStateException("Can't locate us-west-2")

                    getLogger<RunWithRealCredentials>().warn { "WARNING! Running test with real AWS credentials!" }

                    val connectionManager = AwsConnectionManager.getInstance(project)
                    connectionManager.changeRegion(region)
                    connectionManager.changeCredentialProvider(credentialIdentifier)
                    connectionManager.waitUntilConnectionStateIsStable()

                    assertThat(connectionManager.isValidConnectionSettings()).isTrue

                    base.evaluate()
                } finally {
                    Disposer.dispose(disposable)
                }
            }
        }
    }
}
