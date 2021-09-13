// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.testFramework.ApplicationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import java.util.concurrent.CountDownLatch
import javax.swing.DefaultComboBoxModel

class AsyncComboBoxTest {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    @Test
    fun `can populate combobox`() {
        val spy = spy<DefaultComboBoxModel<String>>()
        val sut = AsyncComboBox(comboBoxModel = spy)
        sut.proposeModelUpdate { it.addElement("1") }
        sut.waitForSelection().get()

        verify(spy).addElement("1")
    }

    @Test
    fun `returns null selection while loading`() {
        val spy = spy<DefaultComboBoxModel<String>>()
        val sut = AsyncComboBox(comboBoxModel = spy)
        val latch = CountDownLatch(1)
        sut.proposeModelUpdate {
            latch.await()
            it.addElement("1")
        }

        assertThat(sut.selectedItem).isNull()

        latch.countDown()
    }

    @Test
    fun `multiple update proposals results in single execution`() {
        val spy = spy<DefaultComboBoxModel<String>>()
        val sut = AsyncComboBox(comboBoxModel = spy)
        sut.proposeModelUpdate { it.addElement("1") }
        sut.proposeModelUpdate { it.addElement("2") }
        sut.proposeModelUpdate { it.addElement("3") }

        sut.waitForSelection().get()

        verify(spy).addElement("3")
    }

    @Test
    fun `long running update proposals preempted by newer ones`() {
        val spy = spy<DefaultComboBoxModel<String>>()
        val sut = AsyncComboBox(comboBoxModel = spy)
        val latch = CountDownLatch(1)
        val latch2 = CountDownLatch(1)
        sut.proposeModelUpdate {
            it.addElement("1")
            latch2.countDown()
            latch.await()
            it.addElement("2")
        }
        // wait for first update to start running
        latch2.await()
        sut.proposeModelUpdate {
            it.addElement("3")
        }

        sut.waitForSelection().get()
        latch.countDown()

        verify(spy).addElement("1")
        verify(spy).addElement("3")
        verify(spy, times(0)).addElement("2")
    }
}
