// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.AttachRolePolicyRequest
import software.amazon.awssdk.services.iam.model.AttachRolePolicyResponse
import software.amazon.awssdk.services.iam.model.CreateRoleRequest
import software.amazon.awssdk.services.iam.model.CreateRoleResponse
import software.amazon.awssdk.services.iam.model.DeleteRoleRequest
import software.amazon.awssdk.services.iam.model.DeleteRoleResponse
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockClientManagerRule

class CreateServiceRoleDialogTest {
    private lateinit var client: IamClient
    private lateinit var dialog: CreateIamServiceRoleDialog
    private val name = RuleUtils.randomName()
    private val serviceUri = RuleUtils.randomName()
    private val managedPolicy = RuleUtils.randomName()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    @Before
    fun setup() {
        client = mockClientManagerRule.create()
        runInEdtAndWait {
            dialog = CreateIamServiceRoleDialog(projectRule.project, client, serviceUri, managedPolicy, name)
        }
    }

    @Test
    fun `Role is created`() {
        client.stub {
            on { createRole(any<CreateRoleRequest>()) } doAnswer { CreateRoleResponse.builder().role { it.roleName(name).arn("arn") }.build() }
            on { attachRolePolicy(any<AttachRolePolicyRequest>()) } doAnswer { AttachRolePolicyResponse.builder().build() }
        }
        dialog.createIamRole()
        verify(client).createRole(CreateRoleRequest.builder().roleName(name).assumeRolePolicyDocument(assumeRolePolicy(serviceUri)).build())
        verify(client).attachRolePolicy(AttachRolePolicyRequest.builder().roleName(name).policyArn(managedPolicyNameToArn(managedPolicy)).build())
    }

    @Test
    fun `Role is deleted when attach fails then throws`() {
        client.stub {
            on { createRole(any<CreateRoleRequest>()) } doAnswer { CreateRoleResponse.builder().role { it.roleName(name).arn("arn") }.build() }
            on { attachRolePolicy(any<AttachRolePolicyRequest>()) } doAnswer { throw RuntimeException("Attach failed!") }
            on { deleteRole(any<DeleteRoleRequest>()) } doAnswer { DeleteRoleResponse.builder().build() }
        }
        assertThatThrownBy { dialog.createIamRole() }.hasMessage("Attach failed!")
        verify(client).createRole(CreateRoleRequest.builder().roleName(name).assumeRolePolicyDocument(assumeRolePolicy(serviceUri)).build())
        verify(client).attachRolePolicy(AttachRolePolicyRequest.builder().roleName(name).policyArn(managedPolicyNameToArn(managedPolicy)).build())
        verify(client).deleteRole(DeleteRoleRequest.builder().roleName(name).build())
    }

    @Test
    fun `Role deletion fails`() {
        client.stub {
            on { createRole(any<CreateRoleRequest>()) } doAnswer { CreateRoleResponse.builder().role { it.roleName(name).arn("arn") }.build() }
            on { attachRolePolicy(any<AttachRolePolicyRequest>()) } doAnswer { throw RuntimeException("Attach failed!") }
            on { deleteRole(any<DeleteRoleRequest>()) } doAnswer { throw RuntimeException("Delete role failed!") }
        }
        assertThatThrownBy { dialog.createIamRole() }.hasMessage("Attach failed!")
        verify(client).createRole(CreateRoleRequest.builder().roleName(name).assumeRolePolicyDocument(assumeRolePolicy(serviceUri)).build())
        verify(client).attachRolePolicy(AttachRolePolicyRequest.builder().roleName(name).policyArn(managedPolicyNameToArn(managedPolicy)).build())
        verify(client).deleteRole(DeleteRoleRequest.builder().roleName(name).build())
    }
}
