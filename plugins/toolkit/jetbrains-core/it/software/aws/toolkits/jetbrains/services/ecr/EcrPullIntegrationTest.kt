// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.testFramework.ProjectRule
import kotlinx.coroutines.future.await
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.core.rules.EcrTemporaryRepositoryRule
import software.aws.toolkits.jetbrains.core.docker.ToolkitDockerAdapter
import software.aws.toolkits.jetbrains.core.docker.getDockerServerRuntimeFacade
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import java.util.UUID

class EcrPullIntegrationTest {
    private val ecrClient = EcrClient.builder()
        .region(Region.US_WEST_2)
        .build()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val folder = TemporaryFolder()

    @Rule
    @JvmField
    val ecrRule = EcrTemporaryRepositoryRule(ecrClient)

    private lateinit var remoteRepo: Repository

    @Before
    fun setUp() {
        remoteRepo = ecrRule.createRepository().toToolkitEcrRepository()!!
    }

    @Test
    fun testPullImage() {
        val remoteTag = UUID.randomUUID().toString()

        val dockerfile = folder.newFile()
        dockerfile.writeText(
            """
                # arbitrary base image with a shell
                FROM public.ecr.aws/docker/library/alpine:latest
                RUN touch $(date +%s)
            """.trimIndent()
        )

        val project = projectRule.project
        runBlocking {
            val serverRuntime = getDockerServerRuntimeFacade(project)
            val ecrLogin = ecrClient.authorizationToken.authorizationData().first().getDockerLogin()
            val dockerAdapter = ToolkitDockerAdapter(project, serverRuntime)
            val imageId = dockerAdapter.buildLocalImage(dockerfile)!!

            // gross transform because we only have the short SHA right now
            val localImage = serverRuntime.agent.getImages(null).first { it.imageId.startsWith(EcrIntegrationTestUtils.getImagePrefix(imageId)) }
            val localImageId = localImage.imageId
            val config = EcrUtils.buildDockerRepositoryModel(ecrLogin, remoteRepo, remoteTag)
            val pushRequest = ImageEcrPushRequest(
                serverRuntime,
                localImageId,
                remoteRepo,
                remoteTag
            )
            // push up and image and then delete the local tag
            EcrUtils.pushImage(projectRule.project, ecrLogin, pushRequest).await()
            localImage.deleteImage().await()
            assertThat(serverRuntime.agent.getImages(null).firstOrNull { it.imageId == localImageId }).isNull()

            // pull it from the remote
            dockerAdapter.pullImage(config).await()
            assertThat(serverRuntime.agent.getImages(null).firstOrNull { it.imageId == localImageId }).isNotNull()
        }
    }

    // FIX_WHEN_MIN_IS_231: deleteImage() is blocking prior to 231
    private fun Unit.await() {}
}
