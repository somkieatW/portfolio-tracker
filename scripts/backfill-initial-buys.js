import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.argv[2];
const supabaseKey = process.argv[3];

if (!supabaseUrl || !supabaseKey) {
    console.error("Usage: node scripts/backfill-initial-buys.js <SUPABASE_URL> <SUPABASE_ANON_KEY>");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function backfillMissingBuys() {
    console.log('--- Starting Backfill Process ---');

    // 1. Fetch All Portfolios
    const { data: portfolios, error: pErr } = await supabase.from('portfolio').select('user_id, assets');
    if (pErr) {
        console.error('Error fetching portfolios:', pErr.message);
        return;
    }

    // 2. Fetch All Transactions
    const { data: transactions, error: txErr } = await supabase.from('transactions').select('*');
    if (txErr) {
        console.error('Error fetching transactions:', txErr.message);
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const payloads = [];

    console.log(`Analyzing ${portfolios.length} user portfolios...`);

    for (const portfolio of portfolios) {
        const userId = portfolio.user_id;
        const assets = portfolio.assets || [];

        for (const a of assets) {
            if (a.isSpeculative) continue; // Skip speculative assets if needed

            // Check if this top-level asset has ANY 'buy' transaction
            const hasBuyTx = transactions.some(t => t.asset_id === a.id && !t.sub_asset_id && t.type === 'buy');

            if (!hasBuyTx && parseFloat(a.invested) > 0) {
                console.log(`[User ${userId}] Asset '${a.name}' is missing a buy entry. Preparing backfill...`);
                payloads.push({
                    asset_id: a.id,
                    user_id: userId,
                    type: 'buy',
                    amount_thb: parseFloat(a.invested || 0).toFixed(2), // Force THB fallback, since everything has a THB equivalent invested base
                    amount_usd: a.currency === 'USD' ? parseFloat(a.investedUSD || 0).toFixed(2) : null,
                    units: parseFloat(a.units || 0).toFixed(8),
                    qty: parseFloat(a.qty || 0).toFixed(8),
                    currency: a.currency || 'THB',
                    date: todayStr,
                    notes: '[System Backfill] Initial Setup Investment'
                });
            }

            // Analyze Sub-Assets inside this asset
            if (a.subAssets && Array.isArray(a.subAssets)) {
                for (const s of a.subAssets) {
                    const hasSubBuyTx = transactions.some(t => t.asset_id === a.id && t.sub_asset_id === s.id && t.type === 'buy');

                    if (!hasSubBuyTx && parseFloat(s.invested) > 0) {
                        console.log(`[User ${userId}] Sub-Asset '${s.name}' is missing a buy entry. Preparing backfill...`);
                        payloads.push({
                            asset_id: a.id,
                            sub_asset_id: s.id,
                            user_id: userId,
                            type: 'buy',
                            amount_thb: parseFloat(s.invested || 0).toFixed(2), // Force THB fallback
                            amount_usd: s.currency === 'USD' ? parseFloat(s.investedUSD || 0).toFixed(2) : null,
                            units: null, // Sub-assets are stocks
                            qty: parseFloat(s.qty || 0).toFixed(8),
                            currency: s.currency || 'THB',
                            date: todayStr,
                            notes: '[System Backfill] Initial Setup Investment'
                        });
                    }
                }
            }
        }
    }

    if (payloads.length === 0) {
        console.log('✅ No missing buy transactions found! Your database is fully synchronized.');
        return;
    }

    console.log(`Found ${payloads.length} missing buy records. Inserting...`);

    // Insert mapping
    const { data, error } = await supabase.from('transactions').insert(payloads).select();

    if (error) {
        console.error('❌ Failed to insert backfill transactions:', error.message);
    } else {
        console.log(`✅ Successfully backfilled ${data.length} buy transactions!`);
    }
}

backfillMissingBuys().catch(console.error);
