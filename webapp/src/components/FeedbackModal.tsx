import { Input, Modal, Radio, Form } from "antd";
import { useEffect } from "react";
import type { DemoItem, Feedback, FeedbackReason } from "../types";

interface FeedbackModalProps {
  item: DemoItem | null;
  open: boolean;
  existing?: Feedback;
  onCancel: () => void;
  onSubmit: (feedback: Feedback) => void;
}

interface FeedbackFormValues {
  reason: FeedbackReason;
  note?: string;
}

const reasons: Array<{ value: FeedbackReason; label: string }> = [
  { value: "content_type", label: "内容类型" },
  { value: "importance", label: "重要性" },
  { value: "action", label: "行动要求" },
  { value: "other", label: "其他" },
];

export default function FeedbackModal({ item, open, existing, onCancel, onSubmit }: FeedbackModalProps) {
  const [form] = Form.useForm<FeedbackFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ reason: existing?.reason ?? "importance", note: existing?.note ?? "" });
  }, [existing, form, open]);

  const handleFinish = (values: FeedbackFormValues) => {
    onSubmit({
      reason: values.reason,
      note: (values.note ?? "").trim(),
      at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    });
  };

  return (
    <Modal
      open={open}
      title={item ? `反馈：${item.title}` : "反馈判断"}
      okText="保存反馈"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
        <Form.Item name="reason" label="哪里不对？" rules={[{ required: true, message: "请选择一个原因" }]}>
          <Radio.Group>
            {reasons.map((reason) => (
              <Radio key={reason.value} value={reason.value}>
                {reason.label}
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>
        <Form.Item name="note" label="补充说明">
          <Input.TextArea rows={3} placeholder="可选：告诉 Cove 你期望的判断" maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
