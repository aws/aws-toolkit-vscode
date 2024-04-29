// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.ApplicationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.spy
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.AwsPlugin
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererExpThresholdGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings.Companion.EXP_THRESHOLD_KEY
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings.Companion.USER_GROUP_KEY
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupStates
import kotlin.reflect.KMutableProperty
import kotlin.reflect.full.memberProperties
import kotlin.reflect.jvm.isAccessible

class CodeWhispererUserGroupSettingsTest {
    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

    private lateinit var sut: CodeWhispererUserGroupSettings

    @Before
    fun setup() {
        sut = CodeWhispererUserGroupSettings()
    }

    @Test
    fun `getGroup should return the current states if the group does exist`() {
        val settingsField = sut::class.memberProperties.find { it.name == "settings" }
        assertThat(settingsField).isNotNull

        settingsField?.let {
            it.isAccessible = true

            @Suppress("UNCHECKED_CAST")
            val settings = it.call(sut) as MutableMap<String, String>

            settings[USER_GROUP_KEY] = CodeWhispererUserGroup.Control.name
            settings[EXP_THRESHOLD_KEY] = CodeWhispererExpThresholdGroup.Exp.name

            assertThat(sut.getGroup<CodeWhispererUserGroup>()).isEqualTo(CodeWhispererUserGroup.Control)
            assertThat(sut.getGroup<CodeWhispererExpThresholdGroup>()).isEqualTo(CodeWhispererExpThresholdGroup.Exp)
        }
    }

    @Test
    fun `getGroup will return null if the group does not exist - mix case`() {
        val settingsField = sut::class.memberProperties.find { it.name == "settings" }
        assertThat(settingsField).isNotNull

        settingsField?.let {
            it.isAccessible = true

            @Suppress("UNCHECKED_CAST")
            val settings = it.call(sut) as MutableMap<String, String>

            settings[USER_GROUP_KEY] = CodeWhispererUserGroup.CrossFile.name
            settings[EXP_THRESHOLD_KEY] = "group that doesn't exist"

            assertThat(sut.getGroup<CodeWhispererUserGroup>()).isEqualTo(CodeWhispererUserGroup.CrossFile)
            assertThat(sut.getGroup<CodeWhispererExpThresholdGroup>()).isNull()
        }
    }

    @Test
    fun `getGroup will return null if the group does not exist - both not exist`() {
        val settingsField = sut::class.memberProperties.find { it.name == "settings" }
        assertThat(settingsField).isNotNull

        settingsField?.let {
            it.isAccessible = true

            @Suppress("UNCHECKED_CAST")
            val settings = it.call(sut) as MutableMap<String, String>

            settings[USER_GROUP_KEY] = "group that doesn't exist"
            settings[EXP_THRESHOLD_KEY] = "another group that doesn't exist"

            assertThat(sut.getGroup<CodeWhispererUserGroup>()).isNull()
            assertThat(sut.getGroup<CodeWhispererExpThresholdGroup>()).isNull()
        }
    }

    @Test
    fun `getUserGroup will assign a group if group is not set yet`() {
        val settingsField = sut::class.memberProperties.find { it.name == "settings" }
        assertThat(settingsField).isNotNull
        settingsField?.let {
            it.isAccessible = true

            @Suppress("UNCHECKED_CAST")
            val settings = it.call(sut) as Map<String, String>
            assertThat(settings).hasSize(0)

            val userGroupAssigned = sut.getUserGroup()
            assertThat(userGroupAssigned).isEqualTo(sut.getUserGroup())

            // should be the same no matter how many times we invoke
            assertThat(userGroupAssigned).isEqualTo(sut.getUserGroup())
            assertThat(userGroupAssigned).isEqualTo(sut.getUserGroup())
        }
    }

    @Test
    fun `getUserGroup will return the previously set group if version doesn't change`() {
        val settingsField = sut::class.memberProperties.find { it.name == "settings" }
        assertThat(settingsField).isNotNull

        // if version differs, will re-assign the group
        val oldVersionStoreInAwsXml = AwsToolkit.PLUGINS_INFO.getValue(AwsPlugin.TOOLKIT).version

        settingsField?.let {
            // set up CodeWhispererUserGroupSettings.settings field
            it.isAccessible = true
            @Suppress("UNCHECKED_CAST")
            val settings = it.getter.call(sut) as MutableMap<String, String>
            settings[USER_GROUP_KEY] = CodeWhispererUserGroup.Control.name

            // set up CodeWhispererUserGroupSettings.version field
            val versionField = sut::class.memberProperties.find { field -> field.name == "version" }
            assertThat(versionField).isNotNull
            versionField?.let { myVersion ->
                myVersion as KMutableProperty<*>
                myVersion.isAccessible = true
                myVersion.setter.call(sut, oldVersionStoreInAwsXml)
            }

            assertThat(sut.getUserGroup()).isEqualTo(CodeWhispererUserGroup.Control)

            // will not change the value no matter how many times we invoke getUserGroup
            assertThat(sut.getUserGroup()).isEqualTo(CodeWhispererUserGroup.Control)
        }
    }

    @Test
    fun `getUserGroup will re-assign the group if version changes`() {
        sut = spy(sut)
        sut.loadState(
            CodeWhispererUserGroupStates(
                version = "old version",
                settings = mapOf(USER_GROUP_KEY to CodeWhispererUserGroup.Control.name)
            )
        )

        sut.getUserGroup()

        verify(sut).determineUserGroup()
        assertThat(sut.getVersion()).isEqualTo(AwsToolkit.PLUGINS_INFO.getValue(AwsPlugin.TOOLKIT).version)
    }

    @Test
    fun loadState() {
        // version must use AwsToolkit.PLUGIN_VERSION, otherwise group will be assigned
        val state = CodeWhispererUserGroupStates(
            version = AwsToolkit.PLUGINS_INFO.getValue(AwsPlugin.TOOLKIT).version,
            settings = mapOf(USER_GROUP_KEY to CodeWhispererUserGroup.CrossFile.name)
        )

        sut.loadState(state)

        assertThat(sut.getUserGroup()).isEqualTo(CodeWhispererUserGroup.CrossFile)
        assertThat(sut.getVersion()).isEqualTo(AwsToolkit.PLUGINS_INFO.getValue(AwsPlugin.TOOLKIT).version)
    }
}
