import { functions } from '@/lib/firebase/client';
import { httpsCallable } from 'firebase/functions';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

export const generateCertificate = async (params: {
  eventId: string;
  delegateUid: string;
  applicationId: string;
}): Promise<{ url: string }> => {
  const generateCertCallable = httpsCallable<
    { eventId: string; delegateUid: string; applicationId: string },
    { success: boolean; url: string }
  >(functions, 'generateCertificate');

  const result = await generateCertCallable(params);
  if (!result.data.success || !result.data.url) {
    throw new Error('Failed to generate certificate');
  }
  return result.data;
};

export const getCertificateUrl = async (eventId: string, applicationId: string): Promise<string | null> => {
  try {
    const storage = getStorage();
    const certRef = ref(storage, `certificates/${eventId}/${applicationId}.pdf`);
    const url = await getDownloadURL(certRef);
    return url;
  } catch (error: any) {
    // If object not found, just return null
    if (error.code === 'storage/object-not-found') {
      return null;
    }
    console.error('Error fetching certificate URL:', error);
    return null;
  }
};
