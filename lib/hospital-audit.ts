import { randomUUID } from 'node:crypto';
import clientPromise from '@/lib/mongodb';

export type HospitalAuditEntry = {
  hospitalId: string;
  hospitalName: string;
  actorId: string;
  actorName?: string;
  action: string;
  entityType: 'bed' | 'request' | 'admission' | 'doctor' | 'hospital';
  entityId?: string;
  details: Record<string, unknown>;
  createdAt: Date;
};

export async function writeHospitalAudit(entry: HospitalAuditEntry) {
  try {
    const client = await clientPromise;
    await client.db().collection<HospitalAuditEntry & { _id?: string }>('hospitalAuditLog').insertOne({ ...entry, _id: randomUUID() });
  } catch (error) {
    console.error('Could not write hospital audit record:', error);
  }
}
