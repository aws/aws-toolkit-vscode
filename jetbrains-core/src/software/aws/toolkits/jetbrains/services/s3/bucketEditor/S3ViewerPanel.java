package software.aws.toolkits.jetbrains.services.s3.bucketEditor;

import com.intellij.openapi.Disposable;
import com.intellij.openapi.actionSystem.ActionManager;
import com.intellij.openapi.actionSystem.ActionPlaces;
import com.intellij.openapi.actionSystem.DefaultActionGroup;
import com.intellij.openapi.actionSystem.Separator;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.util.Disposer;
import com.intellij.ui.PopupHandler;
import com.intellij.ui.components.JBScrollPane;
import com.intellij.ui.treeStructure.SimpleTreeStructure;
import com.intellij.util.ui.ColumnInfo;

import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import javax.swing.AbstractAction;
import javax.swing.Action;
import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JPopupMenu;
import javax.swing.JTextField;
import javax.swing.KeyStroke;
import javax.swing.RowFilter;
import javax.swing.SwingConstants;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.TableModel;
import javax.swing.table.TableRowSorter;

import software.aws.toolkits.jetbrains.services.s3.S3RowSorter;
import software.aws.toolkits.jetbrains.services.s3.S3TreeCellRenderer;
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket;
import software.aws.toolkits.jetbrains.services.s3.S3VirtualObject;
import software.aws.toolkits.jetbrains.services.s3.objectActions.CopyPathAction;
import software.aws.toolkits.jetbrains.services.s3.objectActions.DeleteObjectAction;
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction;
import software.aws.toolkits.jetbrains.services.s3.objectActions.RenameObjectAction;
import software.aws.toolkits.jetbrains.services.s3.objectActions.UploadObjectAction;
import software.aws.toolkits.jetbrains.ui.tree.AsyncTreeModel;
import software.aws.toolkits.jetbrains.ui.tree.StructureTreeModel;

import static software.aws.toolkits.resources.Localization.message;

@SuppressWarnings("unchecked")
public class S3ViewerPanel {
    private final int SCROLLPANE_SIZE = 11;
    private JPanel content;
    private JTextField name;
    private JLabel creationDate;
    private JTextField date;
    private JPanel mainPanel;
    private JTextField arnText;
    private JLabel bucketArn;
    private JPanel searchPanel;
    private JPanel paginationPanel;
    private JButton searchButton;
    private JTextField searchTextField;
    private JLabel bucketName;
    private S3VirtualBucket bucketVirtual;
    private S3TreeTable treeTable;
    private S3KeyNode s3Node;
    private S3TreeTableModel model;

    public S3ViewerPanel(S3VirtualBucket bucketVirtual) {
        this.bucketVirtual = bucketVirtual;
        this.name.setText(bucketVirtual.getVirtualBucketName());
        this.date.setText(bucketVirtual.formatDate(bucketVirtual.getS3Bucket().creationDate()));

        this.searchButton.setText("Search");
        this.searchTextField.setText("");

        this.arnText.setText("arn:aws:s3:::" + bucketVirtual.getVirtualBucketName());
        this.bucketArn.setText("Bucket ARN:");
        this.bucketName.setText("Bucket Name:");
        this.creationDate.setText("Creation Date:");
        this.date.setEditable(false);
        this.arnText.setEditable(false);
        this.name.setEditable(false);
        JPopupMenu menu = new JPopupMenu();
        Action copyAction = new AbstractAction("Copy") {
            @Override
            public void actionPerformed(ActionEvent ae) {
                arnText.selectAll();
                arnText.copy();
            }
        };
        copyAction.putValue(Action.ACCELERATOR_KEY, KeyStroke.getKeyStroke("command C"));
        menu.add(copyAction);
        arnText.setComponentPopupMenu(menu);

        ApplicationManager.getApplication().executeOnPooledThread(() -> {
            s3Node = new S3KeyNode(bucketVirtual);

            ColumnInfo key = new S3KeyColumnInfo(virtualFile -> virtualFile.getFile().getKey());

            ColumnInfo size = new S3ColumnInfo(message("s3.size"), S3VirtualObject::formatSize);

            ColumnInfo modified = new S3ColumnInfo(message("s3.last_modified"),
                                                   virtualFile -> virtualFile.formatDate(virtualFile.getFile().getLastModified()));

            final ColumnInfo[] COLUMNS = new ColumnInfo[] {key, size, modified};
            createTreeTable(COLUMNS);

            DefaultActionGroup actionGroup = new DefaultActionGroup();
            S3TreeCellRenderer treeRenderer = new S3TreeCellRenderer();
            DefaultTableCellRenderer tableRenderer = new DefaultTableCellRenderer();
            tableRenderer.setHorizontalAlignment(SwingConstants.LEFT);
            /**
             *  Navigation buttons for pages
             */
            JButton next = new JButton(">");
            JButton previous = new JButton("<");
            ActionListener listener = new ActionListener() {
                @Override
                public void actionPerformed(ActionEvent e) {
                    next.setEnabled(true);
                    previous.setEnabled(true);

                    if (e.getSource() == next) {
                        s3Node.updateLimitsOnButtonClick(true);
                        if (s3Node.getNext() == s3Node.getCurrSize()) {
                            next.setEnabled(false);
                        }

                    } else if (e.getSource() == previous) {
                        s3Node.updateLimitsOnButtonClick(false);
                        if (s3Node.getPrev() == 0) {
                            previous.setEnabled(false);
                        }
                    }
                    treeTable.refresh();
                }
            };

            ApplicationManager.getApplication().invokeLater(() -> {
                next.addActionListener(listener);
                previous.addActionListener(listener);
                paginationPanel.add(previous);
                paginationPanel.add(next);

                treeTable = new S3TreeTable(model);
                treeTable.setRootVisible(false);
                treeTable.setDefaultRenderer(Object.class, tableRenderer);
                treeTable.setTreeCellRenderer(treeRenderer);
                treeTable.setCellSelectionEnabled(false);
                JBScrollPane scrollPane = new JBScrollPane(treeTable, JBScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED,
                                                           JBScrollPane.HORIZONTAL_SCROLLBAR_AS_NEEDED);

                treeTable.setRowSelectionAllowed(true);
                int width = treeTable.getPreferredSize().width;
                scrollPane.setPreferredSize(new Dimension(width, treeTable.getRowHeight() * SCROLLPANE_SIZE));

                treeTable.setAutoCreateRowSorter(true);
                searchAndSortTable();

                actionGroup.add(new DownloadObjectAction(treeTable, bucketVirtual));
                actionGroup.add(new UploadObjectAction(bucketVirtual, treeTable, searchButton, searchTextField));
                actionGroup.add(new Separator());
                actionGroup.add(new RenameObjectAction(treeTable, bucketVirtual));
                actionGroup.add(new CopyPathAction(treeTable, bucketVirtual));
                actionGroup.add(new Separator());
                actionGroup.add(new DeleteObjectAction(treeTable, bucketVirtual, searchButton, searchTextField));
                PopupHandler.installPopupHandler(treeTable, actionGroup, ActionPlaces.EDITOR_POPUP, ActionManager.getInstance());
                treeTable.getColumnModel().getColumn(1).setMaxWidth(120);

                mainPanel.add(scrollPane, BorderLayout.CENTER);

                clearSelectionOnWhiteSpace();
            }, ModalityState.defaultModalityState());
        });
    }

    private void createUIComponents() {
    }

    public JComponent getComponent() {
        return content;
    }

    public JTextField getName() {
        return name;
    }

    private void createTreeTable(ColumnInfo[] columns) {
        Disposable myTreeModelDisposable = Disposer.newDisposable();
        SimpleTreeStructure treeStructure = new SimpleTreeStructure.Impl(s3Node);
        StructureTreeModel<SimpleTreeStructure> myTreeModel = new StructureTreeModel(treeStructure, myTreeModelDisposable);
        model = new S3TreeTableModel(new AsyncTreeModel(myTreeModel, true
            , myTreeModelDisposable), columns, myTreeModel);
    }

    /**
     * Search and sort TreeTable(top-level) rows based on text in TextField
     */
    private void searchAndSortTable() {
        TableRowSorter<TableModel> sorter = new S3RowSorter(treeTable.getModel());
        treeTable.setRowSorter(sorter);
        searchButton.addActionListener(e -> search(sorter));
        searchTextField.addActionListener(e -> search(sorter));
    }

    private void search(TableRowSorter<TableModel> sorter) {
        String text = searchTextField.getText();
        if (text.isEmpty()) {
            s3Node.setPrev(S3KeyNode.START_SIZE);
            s3Node.setNext(Math.min(S3KeyNode.UPDATE_LIMIT, s3Node.getCurrSize()));
            sorter.setRowFilter(null);
        } else {
            ApplicationManager.getApplication().executeOnPooledThread(() -> {
                s3Node.resetLimitsForSearch();
            });
            sorter.setRowFilter(RowFilter.regexFilter("(?i)" + text));
        }
        sorter.setSortKeys(null);
        treeTable.refresh();
    }

    private void clearSelectionOnWhiteSpace() {
        mainPanel.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent e) {
                if (!treeTable.contains(e.getPoint())) {
                    treeTable.clearSelection();
                }
            }
        });
    }
}
