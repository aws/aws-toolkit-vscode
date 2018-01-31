package software.aws.toolkits.jetbrains.ui;

import com.intellij.icons.AllIcons;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.ui.ValidationInfo;
import com.intellij.openapi.util.Pair;
import com.intellij.ui.AnActionButton;
import com.intellij.ui.ToolbarDecorator;
import com.intellij.ui.components.JBLabel;
import com.intellij.util.ui.UIUtil;
import java.awt.BorderLayout;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.Supplier;
import javax.swing.JComponent;
import javax.swing.JPanel;

public class KeyValueTableEditor {
    private final Supplier<List<KeyValue>> refreshLambda;

    private KeyValueTable table;
    private JBLabel remainingItems;
    private JPanel keyValueTableHolder;
    @SuppressWarnings("unused") // Needed in order to embed this into another form
    private JPanel content;

    private List<KeyValue> initialValues;
    private BiFunction<Pair<String, JComponent>, Pair<String, JComponent>, ValidationInfo> entryValidator;

    public KeyValueTableEditor(Supplier<List<KeyValue>> refreshLambda, Integer itemLimit,
                               BiFunction<Pair<String, JComponent>, Pair<String, JComponent>, ValidationInfo> entryValidator,
                               Runnable changeListener) {
        this.refreshLambda = refreshLambda;
        this.entryValidator = entryValidator;

        ToolbarDecorator toolbar = ToolbarDecorator.createDecorator(table)
                                                   .disableUpDownActions()
                                                   .setAddAction(e -> this.createOrEdit(null))
                                                   .setAddActionUpdater(e -> !table.isBusy())
                                                   .setRemoveActionUpdater(e -> !table.isBusy())
                                                   .setEditAction(e -> this.createOrEdit(table.getSelectedObject()))
                                                   .setEditActionUpdater(e -> !table.isBusy())
                                                   .addExtraAction(new AnActionButton("Refresh", AllIcons.Actions.Refresh) {
                                                       @Override
                                                       public void actionPerformed(AnActionEvent e) {
                                                           verifyAndRefresh();
                                                       }

                                                       @Override
                                                       public boolean isEnabled() {
                                                           return !table.isBusy();
                                                       }
                                                   });

        table.getModel().addTableModelListener(e -> {
            if (itemLimit != null) {
                int remaining = itemLimit - (table.getItems().size());
                remainingItems.setText("Remaining " + remaining + " of " + itemLimit);
                remainingItems.setVisible(true);
            } else {
                remainingItems.setVisible(false);
            }
        });

        table.getModel().addTableModelListener(e -> changeListener.run());

        keyValueTableHolder.add(toolbar.createPanel(), BorderLayout.CENTER);

        remainingItems.setForeground(UIUtil.getLabelDisabledForeground());
    }

    private void verifyAndRefresh() {
        if (table.getModel().equals(initialValues)) {
            if(!MessageUtils.verifyLossOfChanges(table)) {
                return;
            }
        }

        refresh();
    }

    public void refresh() {
        table.setBusy(true);
        ApplicationManager.getApplication().executeOnPooledThread(() -> {
            if (refreshLambda != null) {
                List<KeyValue> updatedValues = refreshLambda.get();
                initialValues = updatedValues;
                table.getModel().setItems(new ArrayList<>(updatedValues));
            }
            table.setBusy(false);
        });
    }

    private void createOrEdit(KeyValue selectedObject) {
        KeyValueEditor entryEditor = new KeyValueEditor(table, selectedObject, entryValidator);
        if (entryEditor.showAndGet()) {
            if (selectedObject != null) {
                selectedObject.setKey(entryEditor.getKey());
                selectedObject.setValue(entryEditor.getValue());
            } else {
                table.getModel().addRow(new KeyValue(entryEditor.getKey(), entryEditor.getValue()));
            }
        }
    }

    public boolean isModified() {
        return !table.getItems().equals(initialValues);
    }

    public void reset() {
        table.getModel().setItems(new ArrayList<>(initialValues));
    }

    public List<KeyValue> getItems() {
        return table.getItems();
    }

    public void setBusy(boolean busy) {
        table.setBusy(busy);
    }

    public boolean isBusy() {
        return table.isBusy();
    }
}
