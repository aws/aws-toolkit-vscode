// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.reset
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.CreateRoleRequest
import software.amazon.awssdk.services.iam.model.CreateRoleResponse
import software.amazon.awssdk.services.iam.model.DeleteRoleRequest
import software.amazon.awssdk.services.iam.model.DeleteRoleResponse
import software.amazon.awssdk.services.iam.model.MalformedPolicyDocumentException
import software.amazon.awssdk.services.iam.model.PutRolePolicyRequest
import software.amazon.awssdk.services.iam.model.PutRolePolicyResponse
import software.aws.toolkits.core.utils.delegateMock

class CreateIamRoleDialogTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val iamMock = delegateMock<IamClient>()

    @Before
    fun setUp() {
        reset(iamMock)
    }

    @Test
    fun roleIsCreated() {
        val createRoleCaptor = argumentCaptor<CreateRoleRequest>()
        val putRoleCaptor = argumentCaptor<PutRolePolicyRequest>()

        iamMock.stub {
            on { createRole(createRoleCaptor.capture()) } doReturn CreateRoleResponse.builder().role { role ->
                role.arn(TEST_ROLE_ARN)
                role.roleName(TEST_ROLE_NAME)
            }.build()

            on { putRolePolicy(putRoleCaptor.capture()) } doReturn PutRolePolicyResponse.builder().build()
        }

        runInEdtAndWait {
            val roleDialog = CreateIamRoleDialog(
                project = projectRule.project,
                iamClient = iamMock,
                defaultPolicyDocument = "",
                defaultAssumeRolePolicyDocument = ""
            )
            val rolePanel = roleDialog.getViewForTesting()
            rolePanel.roleName.text = TEST_ROLE_NAME
            rolePanel.policyDocument.text = TEST_POLICY
            rolePanel.assumeRolePolicyDocument.text = TEST_ASSUME_ROLE

            roleDialog.createIamRoleForTesting()

            val iamRole = roleDialog.iamRole
            assertThat(iamRole?.arn).isEqualTo(TEST_ROLE_ARN)
            assertThat(iamRole?.name).isEqualTo(TEST_ROLE_NAME)
        }

        assertThat(createRoleCaptor.firstValue.roleName()).isEqualTo(TEST_ROLE_NAME)
        assertThat(createRoleCaptor.firstValue.assumeRolePolicyDocument()).isEqualTo(TEST_ASSUME_ROLE)
        assertThat(putRoleCaptor.firstValue.roleName()).isEqualTo(TEST_ROLE_NAME)
        assertThat(putRoleCaptor.firstValue.policyDocument()).isEqualTo(TEST_POLICY)
    }

    @Test
    fun roleIsDeletedIfCreationFails() {
        val deleteRolCaptor = argumentCaptor<DeleteRoleRequest>()

        iamMock.stub {
            on { createRole(any<CreateRoleRequest>()) } doReturn CreateRoleResponse.builder().role { role ->
                role.arn(TEST_ROLE_ARN)
                role.roleName(TEST_ROLE_NAME)
            }.build()

            on { putRolePolicy(any<PutRolePolicyRequest>()) } doThrow MalformedPolicyDocumentException.builder().build()

            on { deleteRole(deleteRolCaptor.capture()) } doReturn DeleteRoleResponse.builder().build()
        }

        runInEdtAndWait {
            val roleDialog = CreateIamRoleDialog(
                project = projectRule.project,
                iamClient = iamMock,
                defaultPolicyDocument = "",
                defaultAssumeRolePolicyDocument = ""
            )
            val rolePanel = roleDialog.getViewForTesting()
            rolePanel.roleName.text = TEST_ROLE_NAME
            rolePanel.policyDocument.text = TEST_POLICY
            rolePanel.assumeRolePolicyDocument.text = TEST_ASSUME_ROLE

            assertThatThrownBy { roleDialog.createIamRoleForTesting() }

            assertThat(roleDialog.iamRole).isNull()
        }

        assertThat(deleteRolCaptor.firstValue.roleName()).isEqualTo(TEST_ROLE_NAME)
    }

    private companion object {
        const val TEST_ROLE_NAME = "TetRole"
        const val TEST_ROLE_ARN = "arn:aws:iam::123456789012:role/TetRole"
        const val TEST_POLICY = "{\"hello\": \"world\"}"
        const val TEST_ASSUME_ROLE = "{\"foo\": \"bar\"}"
    }
}
