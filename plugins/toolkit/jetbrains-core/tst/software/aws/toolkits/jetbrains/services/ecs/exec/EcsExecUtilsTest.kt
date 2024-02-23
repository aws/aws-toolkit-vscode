// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.services.ec2.Ec2Client
import software.amazon.awssdk.services.ec2.model.DescribeInstancesRequest
import software.amazon.awssdk.services.ec2.model.DescribeInstancesResponse
import software.amazon.awssdk.services.ec2.model.IamInstanceProfile
import software.amazon.awssdk.services.ec2.model.Instance
import software.amazon.awssdk.services.ec2.model.Reservation
import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.ContainerDefinition
import software.amazon.awssdk.services.ecs.model.ContainerInstance
import software.amazon.awssdk.services.ecs.model.Deployment
import software.amazon.awssdk.services.ecs.model.DeploymentRolloutState
import software.amazon.awssdk.services.ecs.model.DescribeContainerInstancesRequest
import software.amazon.awssdk.services.ecs.model.DescribeContainerInstancesResponse
import software.amazon.awssdk.services.ecs.model.DescribeServicesRequest
import software.amazon.awssdk.services.ecs.model.DescribeServicesResponse
import software.amazon.awssdk.services.ecs.model.DescribeTasksRequest
import software.amazon.awssdk.services.ecs.model.DescribeTasksResponse
import software.amazon.awssdk.services.ecs.model.ExecuteCommandRequest
import software.amazon.awssdk.services.ecs.model.ExecuteCommandResponse
import software.amazon.awssdk.services.ecs.model.LaunchType
import software.amazon.awssdk.services.ecs.model.Service
import software.amazon.awssdk.services.ecs.model.Task
import software.amazon.awssdk.services.ecs.model.TaskDefinition
import software.amazon.awssdk.services.ecs.model.TaskOverride
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.EvaluationResult
import software.amazon.awssdk.services.iam.model.GetInstanceProfileRequest
import software.amazon.awssdk.services.iam.model.GetInstanceProfileResponse
import software.amazon.awssdk.services.iam.model.InstanceProfile
import software.amazon.awssdk.services.iam.model.PolicyEvaluationDecisionType
import software.amazon.awssdk.services.iam.model.Role
import software.amazon.awssdk.services.iam.model.SimulatePrincipalPolicyRequest
import software.amazon.awssdk.services.iam.model.SimulatePrincipalPolicyResponse
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.region.US_EAST_1
import software.aws.toolkits.jetbrains.core.tools.MockToolManagerRule
import software.aws.toolkits.jetbrains.core.tools.Tool
import software.aws.toolkits.jetbrains.services.ecs.ContainerDetails
import software.aws.toolkits.jetbrains.services.ecs.exec.EcsExecUtils.createCommand
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.services.ssm.SsmPlugin
import java.nio.file.Path
import java.util.concurrent.CompletableFuture

class EcsExecUtilsTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @JvmField
    @Rule
    val toolManager = MockToolManagerRule()

    private lateinit var ecsClient: EcsClient
    private lateinit var iamClient: IamClient
    private lateinit var ec2Client: Ec2Client
    val clusterArn = "sample-cluster-arn-123"
    val serviceArn = "sample-service-arn-123"
    private val taskArn = "sample-task-arn-123"
    private val taskRoleArn = "sample-task-role-arn-123"
    private val taskDefinitionArn = "sample-task-definition-arn-123"

    @Before
    fun setup() {
        ecsClient = mockClientManager.create()
        iamClient = mockClientManager.create()
        ec2Client = mockClientManager.create()
    }

    @Test
    fun `Get the task role overriden in the task`() {
        val task = Task.builder()
            .taskArn(taskArn)
            .overrides(TaskOverride.builder().taskRoleArn(taskRoleArn).build())
            .build()
        ecsClient.stub {
            on { describeTasks(any<DescribeTasksRequest>()) } doAnswer { DescribeTasksResponse.builder().tasks(listOf(task)).build() }
        }
        val taskRoleArnResponse = EcsExecUtils.getTaskRoleArn(projectRule.project, clusterArn, taskArn)
        assertThat(taskRoleArnResponse).isEqualTo(taskRoleArn)
    }

    @Test
    fun `Get the task role arn attached to the Task Definition`() {
        val task = Task.builder()
            .taskArn(taskArn)
            .taskDefinitionArn(taskDefinitionArn)
            .overrides(TaskOverride.builder().build())
            .build()
        val taskDefinition = TaskDefinition.builder().taskDefinitionArn(taskDefinitionArn).taskRoleArn(taskRoleArn).build()

        ecsClient.stub {
            on { describeTasks(any<DescribeTasksRequest>()) } doAnswer { DescribeTasksResponse.builder().tasks(listOf(task)).build() }
        }
        resourceCache.addEntry(
            projectRule.project,
            EcsResources.describeTaskDefinition(task.taskDefinitionArn()),
            CompletableFuture.completedFuture(taskDefinition)
        )
        val taskRoleArnResponse = EcsExecUtils.getTaskRoleArn(projectRule.project, clusterArn, taskArn)
        assertThat(taskRoleArnResponse).isEqualTo(taskRoleArn)
    }

    @Test
    fun `If no role specified in the task and launch type is Fargate role Arn is null`() {
        val task = Task.builder()
            .taskArn(taskArn)
            .taskDefinitionArn(taskDefinitionArn)
            .launchType(LaunchType.FARGATE)
            .overrides(TaskOverride.builder().build())
            .build()

        val taskDefinition = TaskDefinition.builder().taskDefinitionArn(taskDefinitionArn).build()
        ecsClient.stub {
            on { describeTasks(any<DescribeTasksRequest>()) } doAnswer { DescribeTasksResponse.builder().tasks(listOf(task)).build() }
        }
        resourceCache.addEntry(
            projectRule.project,
            EcsResources.describeTaskDefinition(task.taskDefinitionArn()),
            CompletableFuture.completedFuture(taskDefinition)
        )

        val taskRoleArnResponse = EcsExecUtils.getTaskRoleArn(projectRule.project, clusterArn, taskArn)
        assertThat(taskRoleArnResponse).isNull()
    }

    @Test
    fun `If no role found in task get the role from EC2 Instance Profile`() {
        val task = Task.builder()
            .taskArn(taskArn)
            .taskDefinitionArn(taskDefinitionArn)
            .launchType(LaunchType.EC2)
            .containerInstanceArn("sample-container-123")
            .overrides(TaskOverride.builder().build())
            .build()
        val taskDefinition = TaskDefinition.builder().taskDefinitionArn(taskDefinitionArn).build()
        val containerInstance = ContainerInstance.builder().containerInstanceArn("sample-container-123").ec2InstanceId("sample-ec2-id").build()
        val iamInstanceProfile = IamInstanceProfile.builder().arn("sample:instance-profile/IamInstanceProfile123").build()
        val instanceProfile = InstanceProfile.builder().roles(Role.builder().arn("sample-task-role-arn-ec2").build()).build()
        val sampleInstance = Instance.builder().instanceId("sample-ec2-id").iamInstanceProfile(iamInstanceProfile).build()
        val reservation = Reservation.builder().instances(sampleInstance).build()

        ecsClient.stub {
            on { describeTasks(any<DescribeTasksRequest>()) } doAnswer { DescribeTasksResponse.builder().tasks(listOf(task)).build() }
            on { describeContainerInstances(any<DescribeContainerInstancesRequest>()) } doAnswer {
                DescribeContainerInstancesResponse.builder().containerInstances(containerInstance).build()
            }
        }

        ec2Client.stub {
            on { describeInstances(any<DescribeInstancesRequest>()) } doAnswer { DescribeInstancesResponse.builder().reservations(reservation).build() }
        }

        iamClient.stub {
            on { getInstanceProfile(any<GetInstanceProfileRequest>()) } doAnswer {
                GetInstanceProfileResponse.builder().instanceProfile(instanceProfile).build()
            }
        }

        resourceCache.addEntry(
            projectRule.project,
            EcsResources.describeTaskDefinition(task.taskDefinitionArn()),
            CompletableFuture.completedFuture(taskDefinition)
        )

        val taskRoleArnResponse = EcsExecUtils.getTaskRoleArn(projectRule.project, clusterArn, taskArn)
        assertThat(taskRoleArnResponse).isEqualTo("sample-task-role-arn-ec2")
    }

    @Test
    fun `If no role found in task or EC2 instance profile null is returned`() {
        val task = Task.builder()
            .taskArn(taskArn)
            .taskDefinitionArn(taskDefinitionArn)
            .launchType(LaunchType.EC2)
            .containerInstanceArn("sample-container-123")
            .overrides(TaskOverride.builder().build())
            .build()
        val taskDefinition = TaskDefinition.builder().taskDefinitionArn(taskDefinitionArn).build()
        val containerInstance = ContainerInstance.builder().containerInstanceArn("sample-container-123").ec2InstanceId("sample-ec2-id").build()
        val iamInstanceProfile = IamInstanceProfile.builder().arn("sample:instance-profile/IamInstanceProfile123").build()
        val instanceProfile = InstanceProfile.builder().roles(Role.builder().build()).build()
        val sampleInstance = Instance.builder().instanceId("sample-ec2-id").iamInstanceProfile(iamInstanceProfile).build()
        val reservation = Reservation.builder().instances(sampleInstance).build()

        ecsClient.stub {
            on { describeTasks(any<DescribeTasksRequest>()) } doAnswer { DescribeTasksResponse.builder().tasks(listOf(task)).build() }
            on { describeContainerInstances(any<DescribeContainerInstancesRequest>()) } doAnswer {
                DescribeContainerInstancesResponse.builder().containerInstances(containerInstance).build()
            }
        }
        ec2Client.stub {
            on { describeInstances(any<DescribeInstancesRequest>()) } doAnswer { DescribeInstancesResponse.builder().reservations(reservation).build() }
        }

        iamClient.stub {
            on { getInstanceProfile(any<GetInstanceProfileRequest>()) } doAnswer {
                GetInstanceProfileResponse.builder().instanceProfile(instanceProfile).build()
            }
        }
        resourceCache.addEntry(
            projectRule.project,
            EcsResources.describeTaskDefinition(task.taskDefinitionArn()),
            CompletableFuture.completedFuture(taskDefinition)
        )

        val taskRoleArnResponse = EcsExecUtils.getTaskRoleArn(projectRule.project, clusterArn, taskArn)
        assertThat(taskRoleArnResponse).isNull()
    }

    @Test
    fun `Ensure that required permissions are present`() {
        val task = Task.builder()
            .taskArn(taskArn)
            .overrides(TaskOverride.builder().build())
            .taskDefinitionArn(taskDefinitionArn)
            .build()
        val evaluationResult = EvaluationResult.builder().evalDecision(PolicyEvaluationDecisionType.ALLOWED).build()
        val taskDefinition = TaskDefinition.builder().taskDefinitionArn(taskDefinitionArn).taskRoleArn(taskRoleArn).build()
        resourceCache.addEntry(
            projectRule.project,
            EcsResources.describeTaskDefinition(task.taskDefinitionArn()),
            CompletableFuture.completedFuture(taskDefinition)
        )

        ecsClient.stub {
            on { describeTasks(any<DescribeTasksRequest>()) } doAnswer { DescribeTasksResponse.builder().tasks(listOf(task)).build() }
        }

        iamClient.stub {
            on { simulatePrincipalPolicy(any<SimulatePrincipalPolicyRequest>()) } doAnswer {
                SimulatePrincipalPolicyResponse.builder().evaluationResults(evaluationResult).build()
            }
        }

        val haveRequiredPermissions = EcsExecUtils.checkRequiredPermissions(projectRule.project, clusterArn, taskArn)
        assertThat(haveRequiredPermissions).isTrue
    }

    @Test
    fun `Task role doesn't have required permissions`() {
        val task = Task.builder()
            .taskArn(taskArn)
            .overrides(TaskOverride.builder().build())
            .taskDefinitionArn(taskDefinitionArn)
            .build()

        val evaluationResult = EvaluationResult.builder().evalDecision(PolicyEvaluationDecisionType.IMPLICIT_DENY).build()
        val taskDefinition = TaskDefinition.builder().taskDefinitionArn(taskDefinitionArn).taskRoleArn(taskRoleArn).build()
        resourceCache.addEntry(
            projectRule.project,
            EcsResources.describeTaskDefinition(task.taskDefinitionArn()),
            CompletableFuture.completedFuture(taskDefinition)
        )
        ecsClient.stub {
            on { describeTasks(any<DescribeTasksRequest>()) } doAnswer { DescribeTasksResponse.builder().tasks(listOf(task)).build() }
        }

        iamClient.stub {
            on { simulatePrincipalPolicy(any<SimulatePrincipalPolicyRequest>()) } doAnswer {
                SimulatePrincipalPolicyResponse.builder().evaluationResults(evaluationResult).build()
            }
        }

        val haveRequiredPermissions = EcsExecUtils.checkRequiredPermissions(projectRule.project, clusterArn, taskArn)
        assertThat(haveRequiredPermissions).isFalse
    }

    @Test
    fun `Service update in progress returns false`() {
        val ecsService = Service.builder()
            .clusterArn(clusterArn)
            .serviceArn(serviceArn)
            .enableExecuteCommand(true)
            .serviceName("service-name")
            .deployments(listOf(Deployment.builder().rolloutState(DeploymentRolloutState.IN_PROGRESS).build()))
            .build()
        ecsClient.stub {
            on {
                describeServices(any<DescribeServicesRequest>())
            } doAnswer {
                DescribeServicesResponse.builder().services(ecsService).build()
            }
        }
        val serviceStateStable = runBlocking {
            EcsExecUtils.ensureServiceIsInStableState(projectRule.project, ecsService)
        }
        assertThat(serviceStateStable).isFalse
    }

    @Test
    fun `Service is currently stable returns true`() {
        val ecsService = Service.builder()
            .clusterArn(clusterArn)
            .serviceArn(serviceArn)
            .enableExecuteCommand(true)
            .serviceName("service-name")
            .deployments(listOf(Deployment.builder().rolloutState(DeploymentRolloutState.COMPLETED).build()))
            .build()
        ecsClient.stub {
            on {
                describeServices(any<DescribeServicesRequest>())
            } doAnswer {
                DescribeServicesResponse.builder().services(ecsService).build()
            }
        }
        val serviceStateStable = runBlocking {
            EcsExecUtils.ensureServiceIsInStableState(projectRule.project, ecsService)
        }
        assertThat(serviceStateStable).isTrue
    }

    @Test
    fun `SSM command is created correctly`() {
        val credentials = AwsBasicCredentials.create(aString(), aString())
        val mockCredentialProvider = mock<AwsCredentialsProvider> {
            on {
                resolveCredentials()
            }.thenAnswer { credentials }
        }
        val connection = ConnectionSettings(aToolkitCredentialsProvider(delegate = mockCredentialProvider), US_EAST_1)
        val cluster = aString()
        val taskId = aString()
        val containerName = aString()
        val command = aString()
        val sessionId = aString()
        val token = aString()
        val streamUrl = aString()
        val cliPath = Path.of("dummy", "file", "path")

        val mockTool = mock<Tool<SsmPlugin>> {
            on {
                path
            }.doReturn(cliPath)
        }

        toolManager.registerTool(SsmPlugin, mockTool)

        ecsClient.stub {
            on {
                executeCommand(
                    ExecuteCommandRequest.builder()
                        .cluster(cluster)
                        .task(taskId)
                        .container(containerName)
                        .interactive(true)
                        .command(command)
                        .build()
                )
            }.thenReturn(
                ExecuteCommandResponse.builder().session {
                    it.sessionId(sessionId)
                    it.tokenValue(token)
                    it.streamUrl(streamUrl)
                }.build()
            )

            val cmd = createCommand(
                projectRule.project,
                connection,
                ContainerDetails(Service.builder().clusterArn(cluster).build(), ContainerDefinition.builder().name(containerName).build()),
                taskId,
                command
            )

            val expectedSession = """{\"sessionId\":\"$sessionId\",\"streamUrl\":\"$streamUrl\",\"tokenValue\":\"$token\"}"""

            assertThat(cmd.commandLineString).isEqualTo(
                """${cliPath.toAbsolutePath()} $expectedSession us-east-1 StartSession"""
            )

            assertThat(cmd.environment).containsEntry("AWS_REGION", "us-east-1")
                .containsEntry("AWS_ACCESS_KEY_ID", credentials.accessKeyId())
                .containsEntry("AWS_SECRET_ACCESS_KEY", credentials.secretAccessKey())
        }
    }
}
