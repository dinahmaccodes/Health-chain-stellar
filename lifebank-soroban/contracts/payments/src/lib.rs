#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, vec, Address, Env, String,
    Vec,
};
use soroban_sdk::token;

// ── Types ──────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PaymentStatus {
    Pending,
    Locked,
    Released,
    Refunded,
    Disputed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DisputeReason {
    FailedDelivery,
    TemperatureExcursion,
    PaymentContested,
    WrongItem,
    DamagedGoods,
    LateDelivery,
    Other,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisputeMetadata {
    pub reason: DisputeReason,
    pub case_id: String,
    pub resolved: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Payment {
    pub id: u64,
    pub request_id: u64,
    pub payer: Address,
    pub payee: Address,
    pub amount: i128,
    pub status: PaymentStatus,
    pub created_at: u64,
    pub updated_at: u64,
    pub dispute_reason_code: Option<u32>,
    pub dispute_case_id: Option<String>,
    pub dispute_resolved: bool,
}

fn dispute_reason_to_code(reason: DisputeReason) -> u32 {
    match reason {
        DisputeReason::FailedDelivery => 1,
        DisputeReason::TemperatureExcursion => 2,
        DisputeReason::PaymentContested => 3,
        DisputeReason::WrongItem => 4,
        DisputeReason::DamagedGoods => 5,
        DisputeReason::LateDelivery => 6,
        DisputeReason::Other => 7,
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PaymentStats {
    pub total_locked: i128,
    pub total_released: i128,
    pub total_refunded: i128,
    pub count_locked: u32,
    pub count_released: u32,
    pub count_refunded: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PaymentPage {
    pub items: Vec<Payment>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
}

/// Recurring / earmarked donation pledge recorded on-chain (schedule enforced off-chain).
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DonationPledge {
    pub id: u64,
    pub donor: Address,
    /// Amount intended each period (smallest units; same convention as [`Payment::amount`])
    pub amount_per_period: i128,
    /// Seconds between executions (e.g. 2_592_000 ≈ 30 days)
    pub interval_secs: u64,
    /// Beneficiary pool or project identifier
    pub payee_pool: String,
    /// Healthcare cause / program tag
    pub cause: String,
    /// Geographic earmark
    pub region: String,
    pub emergency_pool: bool,
    pub active: bool,
    pub created_at: u64,
}

/// On-chain vesting schedule for donor reward tokens.
/// Enforces a cliff + linear vesting so donors cannot withdraw immediately.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VestingSchedule {
    /// Donor who will receive the vested tokens
    pub donor: Address,
    /// Total reward tokens to vest
    pub total_amount: i128,
    /// Ledger timestamp before which no tokens can be claimed
    pub cliff_timestamp: u64,
    /// Ledger timestamp at which 100% of tokens are vested
    pub vest_end_timestamp: u64,
    /// Amount already claimed by the donor
    pub claimed: i128,
}

#[contracterror]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    PaymentNotFound = 500,
    InvalidAmount = 501,
    SamePayerPayee = 502,
    InvalidPage = 503,
    NotPledgeDonor = 504,
    InsufficientEscrowFunds = 505,
    Unauthorized = 506,
    ContractPaused = 507,
    /// Claim attempted before the cliff timestamp
    CliffNotReached = 508,
    /// Vesting schedule not found for this donor
    VestingNotFound = 509,
    /// No additional tokens are claimable at this time
    NothingToClaim = 510,
}

// ── Storage keys ───────────────────────────────────────────────────────────────

const PAYMENT_COUNTER: soroban_sdk::Symbol = symbol_short!("PAY_CTR");
const PLEDGE_COUNTER: soroban_sdk::Symbol = symbol_short!("PLG_CTR");
const ADMIN_KEY: soroban_sdk::Symbol = symbol_short!("ADMIN");
const PAUSED_KEY: soroban_sdk::Symbol = symbol_short!("PAUSED");
const REWARD_TOKEN_KEY: soroban_sdk::Symbol = symbol_short!("RWD_TOK");

/// Build a storage key for a payment by encoding its numeric id into a Symbol.
/// Uses a (u64, &str) tuple as the composite key to avoid Symbol length limits.
fn payment_key(id: u64) -> (u64, &'static str) {
    (id, "pay")
}

fn pledge_key(id: u64) -> (u64, &'static str) {
    (id, "plg")
}

fn get_counter(env: &Env) -> u64 {
    env.storage().instance().get(&PAYMENT_COUNTER).unwrap_or(0u64)
}

fn set_counter(env: &Env, val: u64) {
    env.storage().instance().set(&PAYMENT_COUNTER, &val);
}

fn get_pledge_counter(env: &Env) -> u64 {
    env.storage().instance().get(&PLEDGE_COUNTER).unwrap_or(0u64)
}

fn set_pledge_counter(env: &Env, val: u64) {
    env.storage().instance().set(&PLEDGE_COUNTER, &val);
}

fn store_payment(env: &Env, payment: &Payment) {
    let key = payment_key(payment.id);
    env.storage().persistent().set(&key, payment);
}

fn load_payment(env: &Env, id: u64) -> Option<Payment> {
    let key = payment_key(id);
    env.storage().persistent().get(&key)
}

fn store_pledge(env: &Env, pledge: &DonationPledge) {
    let key = pledge_key(pledge.id);
    env.storage().persistent().set(&key, pledge);
}

fn load_pledge(env: &Env, id: u64) -> Option<DonationPledge> {
    env.storage().persistent().get(&pledge_key(id))
}

fn vesting_key(donor: &Address) -> (Address, &'static str) {
    (donor.clone(), "vest")
}

fn store_vesting(env: &Env, schedule: &VestingSchedule) {
    env.storage()
        .persistent()
        .set(&vesting_key(&schedule.donor), schedule);
}

fn load_vesting(env: &Env, donor: &Address) -> Option<VestingSchedule> {
    env.storage().persistent().get(&vesting_key(donor))
}

// ── Contract ───────────────────────────────────────────────────────────────────

#[contract]
pub struct PaymentContract;

#[contractimpl]
impl PaymentContract {
    /// Initialize the contract and set the admin.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        if env.storage().instance().has(&ADMIN_KEY) {
            return Err(Error::Unauthorized);
        }
        env.storage().instance().set(&ADMIN_KEY, &admin);
        Ok(())
    }

    /// Pause all state-mutating functions. Admin only.
    pub fn pause(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        let stored: Address = env
            .storage()
            .instance()
            .get(&ADMIN_KEY)
            .ok_or(Error::Unauthorized)?;
        if admin != stored {
            return Err(Error::Unauthorized);
        }
        env.storage().instance().set(&PAUSED_KEY, &true);
        Ok(())
    }

    /// Unpause the contract. Admin only.
    pub fn unpause(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        let stored: Address = env
            .storage()
            .instance()
            .get(&ADMIN_KEY)
            .ok_or(Error::Unauthorized)?;
        if admin != stored {
            return Err(Error::Unauthorized);
        }
        env.storage().instance().set(&PAUSED_KEY, &false);
        Ok(())
    }

    /// Returns whether the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&PAUSED_KEY)
            .unwrap_or(false)
    }

    fn require_not_paused(env: &Env) -> Result<(), Error> {
        if env
            .storage()
            .instance()
            .get(&PAUSED_KEY)
            .unwrap_or(false)
        {
            return Err(Error::ContractPaused);
        }
        Ok(())
    }

    /// Create a new payment record.
    pub fn create_payment(
        env: Env,
        request_id: u64,
        payer: Address,
        payee: Address,
        amount: i128,
    ) -> Result<u64, Error> {
        Self::require_not_paused(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if payer == payee {
            return Err(Error::SamePayerPayee);
        }

        payer.require_auth();

        let counter = get_counter(&env) + 1;
        set_counter(&env, counter);

        let now = env.ledger().timestamp();
        let payment = Payment {
            id: counter,
            request_id,
            payer,
            payee,
            amount,
            status: PaymentStatus::Pending,
            created_at: now,
            updated_at: now,
            dispute_reason_code: None,
            dispute_case_id: None,
            dispute_resolved: false,
        };

        store_payment(&env, &payment);

        env.events().publish(
            (symbol_short!("payment"), symbol_short!("created")),
            counter,
        );

        Ok(counter)
    }

    /// Create an escrow payment: verify the hospital has sufficient balance,
    /// then transfer funds from the hospital to this contract and record the
    /// payment as `Locked`.
    ///
    /// Returns `Error::InsufficientEscrowFunds { required, available }` if the
    /// hospital's token balance is below `amount`, so the NestJS backend can
    /// surface a meaningful error message instead of an opaque host panic.
    ///
    /// No storage entry is written if the balance check fails.
    pub fn create_escrow(
        env: Env,
        request_id: u64,
        hospital: Address,
        payee: Address,
        amount: i128,
        token: Address,
    ) -> Result<u64, Error> {
        Self::require_not_paused(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if hospital == payee {
            return Err(Error::SamePayerPayee);
        }

        hospital.require_auth();

        // Balance check BEFORE any state is written.
        let token_client = token::Client::new(&env, &token);
        let available = token_client.balance(&hospital);
        if available < amount {
            return Err(Error::InsufficientEscrowFunds);
        }

        // Transfer funds into escrow (this contract).
        token_client.transfer(&hospital, &env.current_contract_address(), &amount);

        let counter = get_counter(&env) + 1;
        set_counter(&env, counter);

        let now = env.ledger().timestamp();
        let payment = Payment {
            id: counter,
            request_id,
            payer: hospital,
            payee,
            amount,
            status: PaymentStatus::Locked,
            created_at: now,
            updated_at: now,
            dispute_reason_code: None,
            dispute_case_id: None,
            dispute_resolved: false,
        };

        store_payment(&env, &payment);

        env.events().publish(
            (symbol_short!("payment"), symbol_short!("escrowed")),
            counter,
        );

        Ok(counter)
    }

    /// Update payment status (internal helper exposed for testing).
    pub fn update_status(env: Env, payment_id: u64, status: PaymentStatus) -> Result<(), Error> {
        Self::require_not_paused(&env)?;
        let mut payment = load_payment(&env, payment_id).ok_or(Error::PaymentNotFound)?;
        payment.status = status;
        payment.updated_at = env.ledger().timestamp();
        store_payment(&env, &payment);
        Ok(())
    }

    /// Record a dispute against a payment with reason taxonomy and case reference.
    pub fn record_dispute(
        env: Env,
        payment_id: u64,
        reason: DisputeReason,
        case_id: String,
    ) -> Result<(), Error> {
        Self::require_not_paused(&env)?;
        let mut payment = load_payment(&env, payment_id).ok_or(Error::PaymentNotFound)?;
        payment.status = PaymentStatus::Disputed;
        payment.dispute_reason_code = Some(dispute_reason_to_code(reason));
        payment.dispute_case_id = Some(case_id.clone());
        payment.dispute_resolved = false;
        payment.updated_at = env.ledger().timestamp();
        store_payment(&env, &payment);

        env.events().publish(
            (symbol_short!("payment"), symbol_short!("disputed")),
            (payment_id, case_id),
        );

        Ok(())
    }

    /// Mark a disputed payment's case as resolved.
    pub fn resolve_dispute(env: Env, payment_id: u64) -> Result<(), Error> {
        Self::require_not_paused(&env)?;
        let mut payment = load_payment(&env, payment_id).ok_or(Error::PaymentNotFound)?;
        if payment.dispute_case_id.is_some() {
            payment.dispute_resolved = true;
        }
        payment.updated_at = env.ledger().timestamp();
        store_payment(&env, &payment);

        env.events().publish(
            (symbol_short!("payment"), symbol_short!("resolved")),
            payment_id,
        );

        Ok(())
    }

    // ── Query functions ────────────────────────────────────────────────────────

    /// Get a single payment by its ID.
    pub fn get_payment(env: Env, payment_id: u64) -> Result<Payment, Error> {
        load_payment(&env, payment_id).ok_or(Error::PaymentNotFound)
    }

    /// Find the first payment associated with a given request ID.
    pub fn get_payment_by_request(env: Env, request_id: u64) -> Result<Payment, Error> {
        let counter = get_counter(&env);
        for i in 1..=counter {
            if let Some(payment) = load_payment(&env, i) {
                if payment.request_id == request_id {
                    return Ok(payment);
                }
            }
        }
        Err(Error::PaymentNotFound)
    }

    /// Get all payments where the given address is the payer, with pagination.
    pub fn get_payments_by_payer(
        env: Env,
        payer: Address,
        page: u32,
        page_size: u32,
    ) -> PaymentPage {
        let page_size = if page_size == 0 { 20 } else { page_size };
        let counter = get_counter(&env);
        let mut all = vec![&env];

        for i in 1..=counter {
            if let Some(p) = load_payment(&env, i) {
                if p.payer == payer {
                    all.push_back(p);
                }
            }
        }

        Self::paginate(&env, all, page, page_size)
    }

    /// Get all payments where the given address is the payee, with pagination.
    pub fn get_payments_by_payee(
        env: Env,
        payee: Address,
        page: u32,
        page_size: u32,
    ) -> PaymentPage {
        let page_size = if page_size == 0 { 20 } else { page_size };
        let counter = get_counter(&env);
        let mut all = vec![&env];

        for i in 1..=counter {
            if let Some(p) = load_payment(&env, i) {
                if p.payee == payee {
                    all.push_back(p);
                }
            }
        }

        Self::paginate(&env, all, page, page_size)
    }

    /// Get all payments filtered by status, with pagination.
    pub fn get_payments_by_status(
        env: Env,
        status: PaymentStatus,
        page: u32,
        page_size: u32,
    ) -> PaymentPage {
        let page_size = if page_size == 0 { 20 } else { page_size };
        let counter = get_counter(&env);
        let mut all = vec![&env];

        for i in 1..=counter {
            if let Some(p) = load_payment(&env, i) {
                if p.status == status {
                    all.push_back(p);
                }
            }
        }

        Self::paginate(&env, all, page, page_size)
    }

    /// Get aggregate payment statistics across all payments.
    pub fn get_payment_statistics(env: Env) -> PaymentStats {
        let counter = get_counter(&env);
        let mut stats = PaymentStats {
            total_locked: 0,
            total_released: 0,
            total_refunded: 0,
            count_locked: 0,
            count_released: 0,
            count_refunded: 0,
        };

        for i in 1..=counter {
            if let Some(payment) = load_payment(&env, i) {
                match payment.status {
                    PaymentStatus::Locked => {
                        stats.total_locked += payment.amount;
                        stats.count_locked += 1;
                    }
                    PaymentStatus::Released => {
                        stats.total_released += payment.amount;
                        stats.count_released += 1;
                    }
                    PaymentStatus::Refunded => {
                        stats.total_refunded += payment.amount;
                        stats.count_refunded += 1;
                    }
                    _ => {}
                }
            }
        }

        stats
    }

    /// Get a chronological timeline of payments (ordered by created_at ascending), paginated.
    pub fn get_payment_timeline(env: Env, page: u32, page_size: u32) -> PaymentPage {
        let page_size = if page_size == 0 { 20 } else { page_size };
        let counter = get_counter(&env);

        // Collect all payments
        let mut all = vec![&env];
        for i in 1..=counter {
            if let Some(p) = load_payment(&env, i) {
                all.push_back(p);
            }
        }

        // Bubble-sort ascending by created_at
        let len = all.len();
        for i in 0..len {
            for j in 0..len.saturating_sub(i + 1) {
                let a = all.get(j).unwrap();
                let b = all.get(j + 1).unwrap();
                if a.created_at > b.created_at {
                    all.set(j, b);
                    all.set(j + 1, a);
                }
            }
        }

        Self::paginate(&env, all, page, page_size)
    }

    /// Return the total number of payments.
    pub fn get_payment_count(env: Env) -> u64 {
        get_counter(&env)
    }

    /// Register an earmarked recurring pledge. Execution / transfers are triggered off-chain
    /// according to `interval_secs`; this stores the commitment and metadata for transparency.
    pub fn create_pledge(
        env: Env,
        donor: Address,
        amount_per_period: i128,
        interval_secs: u64,
        payee_pool: String,
        cause: String,
        region: String,
        emergency_pool: bool,
    ) -> Result<u64, Error> {
        Self::require_not_paused(&env)?;
        donor.require_auth();
        if amount_per_period <= 0 {
            return Err(Error::InvalidAmount);
        }
        if interval_secs == 0 {
            return Err(Error::InvalidAmount);
        }

        let id = get_pledge_counter(&env) + 1;
        set_pledge_counter(&env, id);

        let pledge = DonationPledge {
            id,
            donor: donor.clone(),
            amount_per_period,
            interval_secs,
            payee_pool,
            cause,
            region,
            emergency_pool,
            active: true,
            created_at: env.ledger().timestamp(),
        };
        store_pledge(&env, &pledge);

        env.events().publish(
            (symbol_short!("pledge"), symbol_short!("create")),
            id,
        );

        Ok(id)
    }

    pub fn get_pledge(env: Env, pledge_id: u64) -> Result<DonationPledge, Error> {
        load_pledge(&env, pledge_id).ok_or(Error::PaymentNotFound)
    }

    pub fn set_pledge_active(env: Env, pledge_id: u64, donor: Address, active: bool) -> Result<(), Error> {
        Self::require_not_paused(&env)?;
        donor.require_auth();
        let mut p = load_pledge(&env, pledge_id).ok_or(Error::PaymentNotFound)?;
        if p.donor != donor {
            return Err(Error::NotPledgeDonor);
        }
        p.active = active;
        store_pledge(&env, &p);
        Ok(())
    }

    // ── Vesting ────────────────────────────────────────────────────────────────

    /// Create a vesting schedule for a donor's reward tokens. Admin only.
    ///
    /// Tokens vest linearly from `cliff_timestamp` to `vest_end_timestamp`.
    /// No tokens can be claimed before the cliff.
    ///
    /// # Arguments
    /// * `donor`         - Recipient of the vested tokens
    /// * `total_amount`  - Total reward tokens to vest
    /// * `cliff_secs`    - Seconds from now until the cliff
    /// * `duration_secs` - Total vesting duration in seconds (from now)
    ///
    /// # Errors
    /// - `Unauthorized`   - Caller is not the admin
    /// - `InvalidAmount`  - `total_amount` ≤ 0 or `duration_secs` = 0
    pub fn create_vesting(
        env: Env,
        admin: Address,
        donor: Address,
        total_amount: i128,
        cliff_secs: u64,
        duration_secs: u64,
    ) -> Result<(), Error> {
        admin.require_auth();
        Self::require_not_paused(&env)?;

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN_KEY)
            .ok_or(Error::Unauthorized)?;
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        if total_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if duration_secs == 0 {
            return Err(Error::InvalidAmount);
        }

        let now = env.ledger().timestamp();
        let schedule = VestingSchedule {
            donor: donor.clone(),
            total_amount,
            cliff_timestamp: now + cliff_secs,
            vest_end_timestamp: now + duration_secs,
            claimed: 0,
        };

        store_vesting(&env, &schedule);

        env.events().publish(
            (symbol_short!("vest"), symbol_short!("created")),
            (donor, total_amount, now + cliff_secs, now + duration_secs),
        );

        Ok(())
    }

    /// Claim linearly vested tokens for the calling donor.
    ///
    /// Calculates the claimable amount at the current ledger time and transfers
    /// only that portion to the donor via the reward token contract.
    ///
    /// # Errors
    /// - `VestingNotFound`  - No schedule exists for this donor
    /// - `CliffNotReached`  - Current time is before the cliff timestamp
    /// - `NothingToClaim`   - All vested tokens have already been claimed
    pub fn claim_vested(env: Env, donor: Address, reward_token: Address) -> Result<i128, Error> {
        donor.require_auth();
        Self::require_not_paused(&env)?;

        let mut schedule = load_vesting(&env, &donor).ok_or(Error::VestingNotFound)?;

        let now = env.ledger().timestamp();

        if now < schedule.cliff_timestamp {
            return Err(Error::CliffNotReached);
        }

        // Linear vesting: vested = total * elapsed / duration
        let vested = if now >= schedule.vest_end_timestamp {
            schedule.total_amount
        } else {
            let elapsed = now - schedule.cliff_timestamp;
            let duration = schedule.vest_end_timestamp - schedule.cliff_timestamp;
            // Use i128 arithmetic; duration > 0 guaranteed by create_vesting
            (schedule.total_amount * elapsed as i128) / duration as i128
        };

        let claimable = vested - schedule.claimed;
        if claimable <= 0 {
            return Err(Error::NothingToClaim);
        }

        // Guard: donor can never claim more than total_amount across all claims
        let new_claimed = schedule.claimed + claimable;
        if new_claimed > schedule.total_amount {
            return Err(Error::NothingToClaim);
        }

        schedule.claimed = new_claimed;
        store_vesting(&env, &schedule);

        // Transfer claimable tokens from this contract to the donor
        let token_client = token::Client::new(&env, &reward_token);
        token_client.transfer(&env.current_contract_address(), &donor, &claimable);

        env.events().publish(
            (symbol_short!("vest"), symbol_short!("claimed")),
            (donor, claimable, new_claimed),
        );

        Ok(claimable)
    }

    /// Get the vesting schedule for a donor.
    pub fn get_vesting(env: Env, donor: Address) -> Result<VestingSchedule, Error> {
        load_vesting(&env, &donor).ok_or(Error::VestingNotFound)
    }

    // ── Internal helpers ───────────────────────────────────────────────────────

    fn paginate(env: &Env, items: Vec<Payment>, page: u32, page_size: u32) -> PaymentPage {
        let total = items.len() as u64;
        let start = (page as u64) * (page_size as u64);
        let mut result = vec![env];

        if start < total {
            let end = (start + page_size as u64).min(total);
            for i in start..end {
                result.push_back(items.get(i as u32).unwrap());
            }
        }

        PaymentPage {
            items: result,
            total,
            page,
            page_size,
        }
    }
}

mod test;
