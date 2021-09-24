// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import kotlinx.coroutines.launch
import org.jetbrains.annotations.TestOnly
import org.jetbrains.concurrency.AsyncPromise
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.utils.ui.selected
import java.awt.Component
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.DefaultComboBoxModel
import javax.swing.JList
import javax.swing.MutableComboBoxModel
import javax.swing.event.ListDataListener

class AsyncComboBox<T>(
    private val comboBoxModel: MutableComboBoxModel<T> = DefaultComboBoxModel(),
    customizer: SimpleListCellRenderer.Customizer<in T>? = null
) : ComboBox<T>(comboBoxModel), Disposable {
    private val loading = AtomicBoolean(false)
    private val scope = disposableCoroutineScope(this)
    init {
        renderer = object : SimpleListCellRenderer<T>() {
            override fun getListCellRendererComponent(
                list: JList<out T>?,
                value: T?,
                index: Int,
                selected: Boolean,
                hasFocus: Boolean
            ): Component {
                val component = super.getListCellRendererComponent(list, value, index, selected, hasFocus) as SimpleListCellRenderer<*>

                if (loading.get() && index == -1) {
                    component.icon = AnimatedIcon.Default.INSTANCE
                    component.text = "Loading"
                }

                return component
            }

            override fun customize(list: JList<out T>, value: T, index: Int, selected: Boolean, hasFocus: Boolean) {
                customizer?.customize(this, value, index)
            }
        }
    }

    private val reloadAlarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.SWING_THREAD, this)
    private var currentIndicator: ProgressIndicator? = null

    @Synchronized
    fun proposeModelUpdate(newModel: suspend (MutableComboBoxModel<T>) -> Unit) {
        reloadAlarm.cancelAllRequests()
        currentIndicator?.cancel()
        loading.set(true)
        removeAllItems()
        val indicator = EmptyProgressIndicator(ModalityState.NON_MODAL).also {
            currentIndicator = it
        }
        // delay with magic number to debounce
        reloadAlarm.addRequest(
            {
                ProgressManager.getInstance().runProcess(
                    {
                        scope.launch {
                            newModel.invoke(delegatedComboBoxModel(indicator))
                            indicator.checkCanceled()
                            loading.set(false)
                            repaint()
                        }
                    },
                    indicator
                )
            },
            350
        )
    }

    override fun dispose() {
    }

    override fun getSelectedItem(): Any? {
        if (loading.get()) {
            return null
        }
        return super.getSelectedItem()
    }

    @TestOnly
    @Synchronized
    internal fun waitForSelection(): Future<T?> {
        val future = AsyncPromise<T>()
        while (loading.get()) {
            Thread.onSpinWait()
        }
        future.setResult(selected())

        return future
    }

    override fun setSelectedItem(anObject: Any?) {
        if (loading.get()) {
            return
        }
        super.setSelectedItem(anObject)
    }

    private fun delegatedComboBoxModel(indicator: ProgressIndicator) =
        object : MutableComboBoxModel<T> {
            override fun getSize() = comboBoxModel.size
            override fun getElementAt(index: Int): T = comboBoxModel.getElementAt(index)

            override fun addListDataListener(l: ListDataListener?) {
                throw NotImplementedError()
            }

            override fun removeListDataListener(l: ListDataListener?) {
                throw NotImplementedError()
            }

            override fun setSelectedItem(anItem: Any?) {
                comboBoxModel.selectedItem = anItem
            }

            override fun getSelectedItem(): Any = comboBoxModel.selectedItem

            override fun addElement(item: T?) {
                indicator.checkCanceled()
                comboBoxModel.addElement(item)
            }

            override fun removeElement(obj: Any?) {
                indicator.checkCanceled()
                comboBoxModel.removeElement(item)
            }

            override fun insertElementAt(item: T?, index: Int) {
                indicator.checkCanceled()
                comboBoxModel.insertElementAt(item, index)
            }

            override fun removeElementAt(index: Int) {
                indicator.checkCanceled()
                comboBoxModel.removeElementAt(index)
            }
        }
}
