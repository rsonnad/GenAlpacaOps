/**
 * SignWell Webhook Handler
 * Receives webhook notifications when documents are signed
 *
 * Deploy with: supabase functions deploy signwell-webhook
 * Webhook URL: https://aphrrfprbixmhissnjfn.supabase.co/functions/v1/signwell-webhook
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignWellWebhookPayload {
  event: string;
  document_id: string;
  document_name: string;
  status: string;
  completed_at?: string;
  recipients?: Array<{
    name: string;
    email: string;
    status: string;
    signed_at?: string;
  }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const payload: SignWellWebhookPayload = await req.json();
    console.log('SignWell webhook received:', payload);

    // Only handle document_completed events
    if (payload.event !== 'document_completed') {
      console.log(`Ignoring event: ${payload.event}`);
      return new Response(
        JSON.stringify({ message: 'Event ignored', event: payload.event }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const documentId = payload.document_id;

    // Find the rental application with this SignWell document ID
    const { data: application, error: findError } = await supabase
      .from('rental_applications')
      .select('id, generated_pdf_url')
      .eq('signwell_document_id', documentId)
      .single();

    if (findError || !application) {
      console.error('Application not found for document:', documentId);
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get SignWell config for API key
    const { data: config, error: configError } = await supabase
      .from('signwell_config')
      .select('api_key')
      .single();

    if (configError || !config?.api_key) {
      console.error('SignWell config not found');
      return new Response(
        JSON.stringify({ error: 'SignWell not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download the signed PDF from SignWell
    const pdfResponse = await fetch(
      `https://www.signwell.com/api/v1/documents/${documentId}/completed_pdf`,
      {
        headers: {
          'X-Api-Key': config.api_key,
        },
      }
    );

    if (!pdfResponse.ok) {
      throw new Error(`Failed to download signed PDF: ${pdfResponse.status}`);
    }

    const pdfBlob = await pdfResponse.blob();
    const pdfBuffer = await pdfBlob.arrayBuffer();
    const filename = `signed-lease-${application.id}-${Date.now()}.pdf`;

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('lease-documents')
      .upload(`signed/${filename}`, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading signed PDF:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('lease-documents')
      .getPublicUrl(`signed/${filename}`);

    const signedPdfUrl = urlData.publicUrl;

    // Update the rental application
    const { error: updateError } = await supabase
      .from('rental_applications')
      .update({
        agreement_status: 'signed',
        agreement_signed_at: new Date().toISOString(),
        signed_pdf_url: signedPdfUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', application.id);

    if (updateError) {
      console.error('Error updating application:', updateError);
      throw updateError;
    }

    console.log(`Document ${documentId} signed and processed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Document signed and processed',
        applicationId: application.id,
        signedPdfUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
