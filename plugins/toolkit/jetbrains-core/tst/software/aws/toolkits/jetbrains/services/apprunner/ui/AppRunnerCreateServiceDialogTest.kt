// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.ui

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.apprunner.model.ConfigurationSource
import software.amazon.awssdk.services.apprunner.model.ConnectionSummary
import software.amazon.awssdk.services.apprunner.model.ImageRepositoryType
import software.amazon.awssdk.services.apprunner.model.ProviderType
import software.amazon.awssdk.services.apprunner.model.Runtime
import software.amazon.awssdk.services.apprunner.model.SourceCodeVersionType
import software.amazon.awssdk.services.iam.model.Role
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.apprunner.resources.AppRunnerResources
import software.aws.toolkits.jetbrains.services.iam.IamResources
import java.util.concurrent.CompletableFuture

class AppRunnerCreateServiceDialogTest {
    private val connectionName = RuleUtils.randomName()
    private val connectionArn = "arn::$connectionName"
    private val roleName = RuleUtils.randomName()
    private val roleArn = "arn::$roleName"

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Before
    fun fillResourceCache() {
        resourceCache.addEntry(
            projectRule.project,
            AppRunnerResources.LIST_CONNECTIONS,
            CompletableFuture.completedFuture(
                listOf(
                    ConnectionSummary
                        .builder()
                        .connectionName(connectionName)
                        .connectionArn(connectionArn)
                        .providerType(ProviderType.GITHUB).build()
                )
            )
        )
        resourceCache.addEntry(
            projectRule.project,
            IamResources.LIST_RAW_ROLES,
            CompletableFuture.completedFuture(
                listOf(
                    Role.builder().roleName(roleName).arn(roleArn).build()
                )
            )
        )
    }

    @Test
    fun `ECR Deployment builds request properly`() {
        val dialog = runInEdtAndGet { CreationDialog(projectRule.project) }
        val panel = CreationPanel(projectRule.project).apply { ecr.isSelected = true }
        // apply to set iam role arn
        panel.component.apply()
        val request = dialog.buildRequest(panel)
        assertThat(request.instanceConfiguration().cpu()).isEqualTo(CreationPanel.cpuValues.first())
        assertThat(request.instanceConfiguration().memory()).isEqualTo(CreationPanel.memoryValues.first())
        assertThat(request.sourceConfiguration().autoDeploymentsEnabled()).isTrue
        assertThat(request.sourceConfiguration().imageRepository().imageRepositoryType()).isEqualTo(ImageRepositoryType.ECR)
        assertThat(request.sourceConfiguration().authenticationConfiguration().accessRoleArn()).isEqualTo(roleArn)
    }

    @Test
    fun `ECR Public Deployment builds request properly`() {
        val dialog = runInEdtAndGet { CreationDialog(projectRule.project) }
        val panel = CreationPanel(projectRule.project).apply {
            ecrPublic.isSelected = true
        }
        val request = dialog.buildRequest(panel)
        // this is actually supposed to be null, but AssertJ throws that it can't be null so we have to do this funky cast
        assertThat(request.sourceConfiguration().autoDeploymentsEnabled() as Any?).isNull()
        assertThat(request.sourceConfiguration().imageRepository().imageRepositoryType()).isEqualTo(ImageRepositoryType.ECR_PUBLIC)
    }

    @Test
    fun `Repository Deployment builds request properly`() {
        val repoUrl = RuleUtils.randomName()
        runInEdtAndGet {
            val dialog = CreationDialog(projectRule.project)
            val panel = CreationPanel(projectRule.project).apply {
                repo.isSelected = true
                repoConfigFromSettings.isSelected = true
                repository = repoUrl
                runtime = Runtime.NODEJS_12
            }
            panel.component.apply()
            val request = dialog.buildRequest(panel)
            assertThat(request.sourceConfiguration().autoDeploymentsEnabled()).isTrue
            assertThat(request.sourceConfiguration().codeRepository().codeConfiguration().configurationSource()).isEqualTo(ConfigurationSource.API)
            assertThat(request.sourceConfiguration().codeRepository().repositoryUrl()).isEqualTo(repoUrl)
            assertThat(request.sourceConfiguration().codeRepository().codeConfiguration().codeConfigurationValues().port()).isEqualTo("80")
            assertThat(request.sourceConfiguration().codeRepository().codeConfiguration().codeConfigurationValues().runtime()).isEqualTo(Runtime.NODEJS_12)
            assertThat(request.sourceConfiguration().codeRepository().sourceCodeVersion().type()).isEqualTo(SourceCodeVersionType.BRANCH)
            assertThat(request.sourceConfiguration().authenticationConfiguration().connectionArn()).isEqualTo(connectionArn)
        }
    }

    @Test
    fun `Repository Deployment with apprunner yaml builds request properly`() {
        val repoUrl = RuleUtils.randomName()
        val dialog = runInEdtAndGet { CreationDialog(projectRule.project).apply { panel.repo.isSelected = true } }
        val panel = CreationPanel(projectRule.project).apply {
            repo.isSelected = true
            repoConfigFromFile.isSelected = true
            manualDeployment.isSelected = true
            repository = repoUrl
        }
        val request = dialog.buildRequest(panel)
        assertThat(request.sourceConfiguration().autoDeploymentsEnabled()).isFalse
        assertThat(request.sourceConfiguration().codeRepository().repositoryUrl()).isEqualTo(repoUrl)
        assertThat(request.sourceConfiguration().codeRepository().codeConfiguration().configurationSource()).isEqualTo(ConfigurationSource.REPOSITORY)
        assertThat(request.sourceConfiguration().codeRepository().codeConfiguration().codeConfigurationValues()).isNull()
        assertThat(request.sourceConfiguration().codeRepository().sourceCodeVersion().type()).isEqualTo(SourceCodeVersionType.BRANCH)
    }

    @Test
    fun `Panel's special setters work`() {
        val panel = CreationPanel(projectRule.project)
        panel.startCommand = "    "
        assertThat(panel.startCommand).isNull()
        panel.repository = " https://abc/ "
        assertThat(panel.repository).isEqualTo("https://abc")
    }

    @Test
    fun `EcrTag URI can be passed through`() {
        val uri = aString()
        val dialog = runInEdtAndGet { CreationDialog(projectRule.project, uri) }
        assertThat(dialog.panel.containerUri).isEqualTo(uri)
    }
}
