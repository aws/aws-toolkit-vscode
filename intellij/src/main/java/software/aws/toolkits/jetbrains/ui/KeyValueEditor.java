package software.aws.toolkits.jetbrains.ui;

import com.intellij.openapi.ui.DialogWrapper;
import com.intellij.openapi.ui.ValidationInfo;
import com.intellij.openapi.util.Pair;
import java.awt.Component;
import java.util.function.BiFunction;
import javax.swing.Action;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JTextField;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class KeyValueEditor extends DialogWrapper {
    private final BiFunction<Pair<String, JComponent>, Pair<String, JComponent>, ValidationInfo> validator;
    private JTextField keyField;
    private JTextField valueField;
    private JPanel component;

    public KeyValueEditor(Component parent,
                       KeyValue initialValue,
                       BiFunction<Pair<String, JComponent>, Pair<String, JComponent>, ValidationInfo> validator) {
        super(parent, false);
        this.validator = validator;

        if (initialValue == null) {
            setTitle("Create New Key-Value");
        } else {
            setTitle("Edit Key-Value");
            keyField.setText(initialValue.getKey());
            valueField.setText(initialValue.getValue());
        }
        init();
    }

    @Nullable
    @Override
    public JComponent getPreferredFocusedComponent() {
        return keyField;
    }

    @Nullable
    @Override
    protected JComponent createCenterPanel() {
        return component;
    }

    @Nullable
    @Override
    protected ValidationInfo doValidate() {
        if(validator != null) {
            return validator.apply(Pair.create(getKey(), keyField), Pair.create(getValue(), valueField));
        } else {
            return null;
        }
    }

    @NotNull
    @Override
    protected Action[] createActions() {
        return new Action[] {getOKAction(), getCancelAction()};
    }

    public String getKey() {
        return keyField.getText().trim();
    }

    public String getValue() {
        return valueField.getText().trim();
    }
}


