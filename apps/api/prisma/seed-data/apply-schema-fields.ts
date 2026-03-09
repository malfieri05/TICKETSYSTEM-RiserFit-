/**
 * Idempotent apply of field definitions to a TicketFormSchema.
 * Upserts each field (by formSchemaId + fieldKey) and syncs options.
 */

import type { PrismaClient } from '@prisma/client';
import type { FormFieldDef } from './field-types';

export async function applySchemaFields(
  prisma: PrismaClient,
  schemaId: string,
  fields: FormFieldDef[],
): Promise<void> {
  for (const f of fields) {
    const { options, ...fieldData } = f;
    const existing = await prisma.ticketFormField.findUnique({
      where: {
        formSchemaId_fieldKey: { formSchemaId: schemaId, fieldKey: f.fieldKey },
      },
      select: { id: true },
    });

    const data = {
      formSchemaId: schemaId,
      fieldKey: f.fieldKey,
      type: f.type,
      label: f.label,
      required: f.required,
      sortOrder: f.sortOrder,
      conditionalFieldKey: f.conditionalFieldKey ?? null,
      conditionalValue: f.conditionalValue ?? null,
    };

    let fieldId: string;
    if (existing) {
      await prisma.ticketFormField.update({
        where: { id: existing.id },
        data: {
          type: data.type,
          label: data.label,
          required: data.required,
          sortOrder: data.sortOrder,
          conditionalFieldKey: data.conditionalFieldKey,
          conditionalValue: data.conditionalValue,
        },
      });
      fieldId = existing.id;
    } else {
      const created = await prisma.ticketFormField.create({ data });
      fieldId = created.id;
    }

    if (options?.length) {
      await prisma.ticketFormFieldOption.deleteMany({ where: { formFieldId: fieldId } });
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        await prisma.ticketFormFieldOption.create({
          data: {
            formFieldId: fieldId,
            value: o.value,
            label: o.label,
            sortOrder: o.sortOrder ?? i,
          },
        });
      }
    }
  }
}
