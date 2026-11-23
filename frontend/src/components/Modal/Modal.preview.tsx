import type { PreviewMeta } from '@components/previewMeta';
import { Button } from '@components/Button/Button';
import { Modal } from './Modal';

export const meta: PreviewMeta = { group: 'Feedback', height: 300, expects: '[role="dialog"]' };

const close = () => {};

export default function ModalPreview() {
  return (
    <Modal
      open
      onClose={close}
      portal={false}
      title="Edit project"
      subtitle="Bike Share Map · Team 4"
      footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={close}>Save changes</Button></>}
    >
      <p>Your team sees the new name and description as soon as you save.</p>
    </Modal>
  );
}
