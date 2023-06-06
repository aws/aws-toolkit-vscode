@file:Suppress("AbsentOrWrongFileLicense")
// Copyright 2000-2022 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
package software.aws.toolkits.jetbrains.ui

import com.intellij.ui.UIBundle
import com.intellij.ui.components.JBTextField
import com.intellij.ui.layout.CellBuilder
import com.intellij.ui.layout.Row
import com.intellij.ui.layout.toBinding
import kotlin.reflect.KMutableProperty0

// https://github.com/JetBrains/intellij-community/blob/e0a2caa682d9d853b2736f0cc0b303ea1936a3c3/platform/platform-impl/src/com/intellij/ui/layout/Cell.kt#L506
fun Row.intTextField(prop: KMutableProperty0<Int>, columns: Int? = null, range: IntRange? = null): CellBuilder<JBTextField> {
    val binding = prop.toBinding()
    return textField(
        { binding.get().toString() },
        { value -> value.toIntOrNull()?.let { intValue -> binding.set(range?.let { intValue.coerceIn(it.first, it.last) } ?: intValue) } },
        columns
    ).withValidationOnInput {
        val value = it.text.toIntOrNull()
        when {
            value == null -> error(UIBundle.message("please.enter.a.number"))
            range != null && value !in range -> error(UIBundle.message("please.enter.a.number.from.0.to.1", range.first, range.last))
            else -> null
        }
    }
}
