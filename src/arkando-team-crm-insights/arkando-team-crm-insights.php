<?php
/**
 * Plugin Name: ArkanDo Team CRM — Intake & Insights
 * Description: Secure collaborative Instagram lead intake, role-independent assignments, and rich analytics connected read-only to ArkanDo Ontology OS. Does not replace canonical commercial CRM.
 * Version: 1.1.4-rc2
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * Author: ArkanDo
 * Text Domain: arkando-team-crm
 */
if (!defined('ABSPATH')) { exit; }

final class Arkando_Team_CRM {
    const VERSION = '1.1.4-rc2';
    const CAP = 'arkando_team_crm_use';
    const API = 'arkando-team-crm/v1';
    const MAX_IMPORT = 2000000;

    private static function table(string $part): string { global $wpdb; return $wpdb->prefix . 'arkando_teamcrm_' . $part; }
    private static function now(): string { return current_time('mysql'); }
    public static function ceo_id(): int { return (int) get_option('arkando_teamcrm_ceo_id', 0); }
    public static function manager(): bool { return get_current_user_id() > 0 && get_current_user_id() === self::ceo_id() && current_user_can('manage_options'); }
    public static function member(): bool { return is_user_logged_in() && (current_user_can(self::CAP) || self::manager()); }
    public static function activate(): void {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $collate = $wpdb->get_charset_collate();
        $contacts = self::table('contacts');
        $channels = self::table('channels');
        $leads = self::table('leads');
        $events = self::table('events');
        dbDelta("CREATE TABLE {$contacts} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            display_name varchar(190) NOT NULL DEFAULT '',
            ig_username varchar(190) NULL DEFAULT NULL,
            company varchar(190) NOT NULL DEFAULT '',
            email varchar(190) NOT NULL DEFAULT '',
            phone_raw varchar(255) NOT NULL DEFAULT '',
            phone_normalized varchar(35) NOT NULL DEFAULT '',
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY ig_username (ig_username),
            KEY phone_normalized (phone_normalized)
        ) ENGINE=InnoDB {$collate};");
        dbDelta("CREATE TABLE {$channels} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            contact_id bigint(20) unsigned NOT NULL,
            channel_type varchar(30) NOT NULL,
            raw_value varchar(190) NOT NULL,
            normalized_value varchar(120) NOT NULL,
            verification varchar(30) NOT NULL DEFAULT 'unverified',
            source_label varchar(190) NOT NULL DEFAULT '',
            created_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY contact_channel (contact_id,channel_type,normalized_value),
            KEY normalized_channel (channel_type,normalized_value)
        ) ENGINE=InnoDB {$collate};");
        dbDelta("CREATE TABLE {$leads} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            contact_id bigint(20) unsigned NOT NULL,
            external_key varchar(190) NOT NULL,
            source_platform varchar(50) NOT NULL DEFAULT 'instagram',
            source_ref varchar(255) NOT NULL DEFAULT '',
            campaign varchar(190) NOT NULL DEFAULT '',
            opportunity_code varchar(90) NOT NULL DEFAULT '',
            product varchar(190) NOT NULL DEFAULT '',
            industry varchar(190) NOT NULL DEFAULT '',
            role_type varchar(50) NOT NULL DEFAULT 'unknown',
            stage varchar(50) NOT NULL DEFAULT 'new',
            comm_state varchar(50) NOT NULL DEFAULT 'unknown',
            verification varchar(50) NOT NULL DEFAULT 'unverified',
            priority varchar(10) NOT NULL DEFAULT 'P3',
            owner_id bigint(20) unsigned NOT NULL DEFAULT 0,
            backup_id bigint(20) unsigned NOT NULL DEFAULT 0,
            progress tinyint(3) unsigned NOT NULL DEFAULT 0,
            next_action varchar(255) NOT NULL DEFAULT '',
            due_at datetime NULL,
            last_contact_at datetime NULL,
            contact_attempts int(10) unsigned NOT NULL DEFAULT 0,
            notes longtext NULL,
            canonical_uuid varchar(36) NOT NULL DEFAULT '',
            revision bigint(20) unsigned NOT NULL DEFAULT 1,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY external_key (external_key),
            KEY contact_opportunity (contact_id,opportunity_code),
            KEY owner_stage (owner_id,stage),
            KEY due_at (due_at),
            KEY created_at (created_at),
            KEY canonical_uuid (canonical_uuid)
        ) ENGINE=InnoDB {$collate};");
        dbDelta("CREATE TABLE {$events} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            lead_id bigint(20) unsigned NOT NULL,
            actor_id bigint(20) unsigned NOT NULL DEFAULT 0,
            event_type varchar(50) NOT NULL,
            event_key varchar(190) NULL DEFAULT NULL,
            summary text NULL,
            change_json longtext NULL,
            occurred_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY event_key (event_key),
            KEY lead_date (lead_id,occurred_at),
            KEY type_date (event_type,occurred_at)
        ) ENGINE=InnoDB {$collate};");
        $admin = get_role('administrator'); if ($admin) $admin->add_cap(self::CAP);
        if (!get_role('arkando_crm_operator')) add_role('arkando_crm_operator', 'ArkanDo CRM Operator', ['read'=>true, self::CAP=>true]);
        if (!self::ceo_id()) {
            $ceo = get_user_by('login', 'omidfarahani');
            if ((!$ceo || !user_can($ceo,'manage_options')) && get_current_user_id() && current_user_can('manage_options')) $ceo=wp_get_current_user();
            if ($ceo && user_can($ceo, 'manage_options')) update_option('arkando_teamcrm_ceo_id', (int)$ceo->ID, false);
        }
        self::ensure_portal_page();
        if (self::transactional_storage()) update_option('arkando_teamcrm_schema', self::VERSION, false);
        else error_log('[ArkanDo CRM] InnoDB tables are required; existing storage was not converted.');
    }
    public static function boot(): void {
        add_action('admin_menu', [__CLASS__, 'admin_menu']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'assets']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'portal_assets']);
        add_action('rest_api_init', [__CLASS__, 'routes']);
        add_filter('rest_post_dispatch', static function($response,$server,$request) {
            if(str_starts_with($request->get_route(),'/'.self::API.'/') && $response instanceof WP_REST_Response) $response->header('Cache-Control','private, no-store, max-age=0');
            return $response;
        },10,3);
        add_action('init', [__CLASS__, 'maybe_upgrade'], 5);
        add_action('admin_init', [__CLASS__, 'redirect_admin_entry'], 12);
        add_action('init', [__CLASS__, 'shortcodes']);
        add_filter('template_include', [__CLASS__, 'portal_template'], 99);
        // Resolve the CRM destination after ordinary site-wide login redirects.
        // Keep WordPress authentication and security-plugin hooks intact.
        add_filter('login_redirect', [__CLASS__, 'login_destination'], PHP_INT_MAX, 3);
        add_filter('show_admin_bar', [__CLASS__, 'admin_bar']);
        add_action('wp_abilities_api_categories_init', [__CLASS__, 'register_ability_category']);
        add_action('wp_abilities_api_init', [__CLASS__, 'register_abilities']);
    }
    public static function maybe_upgrade(): void { if (get_option('arkando_teamcrm_schema') && get_option('arkando_teamcrm_schema') !== self::VERSION && self::manager()) self::activate(); }
    public static function admin_menu(): void { if (self::member()) add_menu_page('ArkanDo Team CRM', 'Team CRM', self::CAP, 'arkando-team-crm', [__CLASS__, 'page'], 'dashicons-chart-area', 6); }
    public static function ensure_portal_page(): void {
        $page_id=(int)get_option('arkando_teamcrm_portal_page',0);
        if ($page_id && get_post_status($page_id)==='publish') return;
        $page=get_page_by_path('team-crm');
        if ($page) {
            if (str_contains((string)$page->post_content,'[arkando_team_crm]')) {
                update_option('arkando_teamcrm_portal_page',(int)$page->ID,false);
            }
            // Never hijack a page owned by another plugin or site editor.
            return;
        }
        $id=wp_insert_post(['post_title'=>'ArkanDo | Team CRM','post_name'=>'team-crm','post_status'=>'publish','post_type'=>'page','post_content'=>'[arkando_team_crm]','comment_status'=>'closed'],true);
        if (!is_wp_error($id)) update_option('arkando_teamcrm_portal_page',(int)$id,false);
    }
    public static function portal_id(): int { return (int)get_option('arkando_teamcrm_portal_page',0); }
    public static function portal_url(): string { $id=self::portal_id();return $id && get_post_status($id)==='publish' ? get_permalink($id):home_url('/team-crm/'); }
    public static function is_portal(): bool { return !is_admin() && self::portal_id() && is_page(self::portal_id()); }
    public static function shortcodes(): void { add_shortcode('arkando_team_crm',[__CLASS__,'portal_shortcode']); }
    public static function portal_template(string $template): string {if(self::is_portal())return __DIR__.'/views/fullscreen.php';return $template;}
    public static function portal_assets(): void {if(self::is_portal())self::enqueue_app_assets();}
    private static function enqueue_app_assets(): void {
        // Remote licensed-font delivery; browser/system fallbacks always remain available.
        wp_enqueue_style('arkando-crm-vazirmatn','https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap',[],null);
        wp_enqueue_style('arkando-team-crm',plugins_url('assets/app.css',__FILE__),['arkando-crm-vazirmatn'],self::VERSION);
        if (self::member()) {
            wp_enqueue_script('arkando-team-crm', plugins_url('assets/app.js', __FILE__), [], self::VERSION, true);
            wp_add_inline_script('arkando-team-crm','window.ARKANDO_CRM = '.wp_json_encode([
                'api'=>rest_url(self::API.'/'),'nonce'=>wp_create_nonce('wp_rest'),
                'portal_url'=>self::portal_url(),'login_url'=>wp_login_url(self::portal_url()),'logo_url'=>plugins_url('assets/arkando-official-logo.png',__FILE__)
            ]).';','before');
        }
    }
    public static function portal_shortcode(): string {
        if(!is_user_logged_in()){
            ob_start();
            echo '<main class="ark-crm-login-shell" dir="rtl"><div class="ark-crm-login-card"><div class="ark-crm-login-mark"><img src="'.esc_url(plugins_url('assets/arkando-official-logo.png',__FILE__)).'" alt="لوگوی اصلی آرکاندو" width="116" height="116"></div><div class="ark-crm-login-kicker">ARKANDO / PRIVATE OPERATIONS</div><h1>ورود به مرکز فرماندهی</h1><p>محیط اختصاصی اعضای مجاز آرکاندو؛ بدون نیاز به ورود به مدیریت وردپرس.</p>';
            wp_login_form(['echo'=>true,'redirect'=>self::portal_url(),'label_username'=>'نام کاربری','label_password'=>'رمز عبور','label_log_in'=>'ورود امن','remember'=>false]);
            echo '<div class="ark-crm-login-note">حساب جدید توسط مدیرعامل ساخته می‌شود؛ ثبت‌نام عمومی غیرفعال است.</div></div></main>';
            return (string)ob_get_clean();
        }
        if(!self::member())return '<main class="ark-crm-login-shell" dir="rtl"><div class="ark-crm-login-card"><h1>دسترسی CRM فعال نیست</h1><p>برای فعال‌سازی دسترسی، با مدیرعامل هماهنگ کنید.</p><a href="'.esc_url(wp_logout_url(self::portal_url())).'">خروج از حساب</a></div></main>';
        return '<div class="ark-crm-wrap" dir="rtl"><div id="ark-crm-root" class="ark-crm-app"><div class="ark-loading">در حال دریافت اطلاعات آرکاندو…</div></div></div>';
    }
    public static function admin_bar(bool $show): bool {return self::is_portal()?false:$show;}
    private static function portal_login_target(string $requested): bool {
        if($requested==='')return false;
        $target=wp_parse_url($requested);$portal=wp_parse_url(self::portal_url());
        if(!$target||!$portal||isset($target['user'])||isset($target['pass']))return false;
        if(isset($target['host'])){
            $scheme=strtolower($target['scheme']??$portal['scheme']??'https');
            $portal_scheme=strtolower($portal['scheme']??'https');
            if(!in_array($scheme,['http','https'],true)||$scheme!==$portal_scheme)return false;
            if(strtolower($target['host'])!==strtolower($portal['host']??''))return false;
            if(($target['port']??($scheme==='https'?443:80))!==($portal['port']??($portal_scheme==='https'?443:80)))return false;
        } elseif(isset($target['scheme'])||str_starts_with($requested,'//'))return false;
        $path=$target['path']??'';
        if($path===''||!str_starts_with($path,'/'))return false;
        if(untrailingslashit($path)===untrailingslashit($portal['path']??'/'))return true;
        wp_parse_str($target['query']??'',$query);
        $home_path=wp_parse_url(home_url('/'),PHP_URL_PATH);
        if(untrailingslashit($path)===untrailingslashit($home_path?:'/') && self::portal_id()>0 && isset($query['page_id']) && is_scalar($query['page_id']) && (string)$query['page_id']===(string)self::portal_id())return true;
        $admin_path=wp_parse_url(admin_url('admin.php'),PHP_URL_PATH);
        return $path===$admin_path && ($query['page']??null)==='arkando-team-crm';
    }
    public static function login_destination(string $redirect,string $requested,$user): string {
        if(!($user instanceof WP_User))return $redirect;
        $crm_access=user_can($user,self::CAP)||((int)$user->ID===self::ceo_id()&&user_can($user,'manage_options'));
        // The explicit CRM entry point applies to the CEO as well as team members.
        if($crm_access&&self::portal_login_target($requested))return self::portal_url();
        // CRM staff also land here when a site-wide rule requested the homepage.
        // Administrators retain their normal destination outside an explicit CRM login.
        if(!user_can($user,'manage_options') && ($crm_access||in_array('arkando_crm_operator',(array)$user->roles,true)))return self::portal_url();
        return $redirect;
    }
    public static function redirect_admin_entry(): void {
        if (wp_doing_ajax() || !self::member())return;
        if(($_GET['page']??'')==='arkando-team-crm') {wp_safe_redirect(self::portal_url());exit;}
        $u=wp_get_current_user();
        if(in_array('arkando_crm_operator',(array)$u->roles,true) && !current_user_can('manage_options') && !defined('WP_CLI')) {
            wp_safe_redirect(self::portal_url());exit;
        }
    }
    public static function operational_member(): bool {return self::member() && !get_user_meta(get_current_user_id(),'arkando_crm_must_change_password',true);}
    public static function assets(string $hook): void {
        if ($hook !== 'toplevel_page_arkando-team-crm' || !self::member()) return;
        self::enqueue_app_assets();
    }
    public static function page(): void {
        if (!self::member()) wp_die('دسترسی مجاز نیست.');
        echo '<div class="wrap ark-crm-wrap" dir="rtl"><div id="ark-crm-root" class="ark-crm-app"><div class="ark-loading">در حال بارگذاری داده‌های CRM...</div></div></div>';
    }
    private static function route(string $path, $methods, $callback, bool $manager=false): void {
        register_rest_route(self::API, $path, ['methods'=>$methods, 'callback'=>[__CLASS__, $callback], 'permission_callback'=>$manager?[__CLASS__,'manager']:[__CLASS__,'operational_member']]);
    }
    public static function routes(): void {
        register_rest_route(self::API,'/bootstrap',['methods'=>'GET','callback'=>[__CLASS__,'bootstrap'],'permission_callback'=>[__CLASS__,'member']]);
        register_rest_route(self::API,'/account/change-password',['methods'=>'POST','callback'=>[__CLASS__,'change_password'],'permission_callback'=>[__CLASS__,'member']]);
        self::route('/staff','POST','create_staff',true);
        self::route('/staff/(?P<id>\d+)/reset','POST','reset_staff',true);
        self::route('/leads','GET','leads');
        self::route('/analytics','GET','analytics');
        self::route('/lead','POST','create_lead');
        self::route('/lead/(?P<id>\d+)','POST','update_lead');
        self::route('/lead/(?P<id>\d+)/events','GET','get_events');
        self::route('/lead/(?P<id>\d+)/events','POST','add_event');
        self::route('/import','POST','import_csv',true);
        self::route('/settings','POST','save_settings',true);
        self::route('/reassign','POST','reassign',true);
    }
    private static function error(string $key,string $message,int $status=400): WP_Error { return new WP_Error($key,$message,['status'=>$status]); }
    public static function bootstrap(): WP_REST_Response {
        $users=get_users(['fields'=>['ID','display_name','user_login'],'orderby'=>'display_name']);
        $allowed=[];foreach($users as $user) if (user_can($user->ID,self::CAP) || $user->ID === self::ceo_id()) $allowed[]=['id'=>(int)$user->ID,'name'=>$user->display_name?:$user->user_login];
        $result=['manager'=>self::manager(),'me'=>get_current_user_id(),'users'=>$allowed,'version'=>self::VERSION, 'password_change_required'=>(bool)get_user_meta(get_current_user_id(),'arkando_crm_must_change_password',true), 'timezone'=>wp_timezone_string(),'server_date'=>substr(self::now(),0,10),'server_offset'=>(new DateTimeImmutable('now',wp_timezone()))->format('P'), 'themes'=>['arkando','aurora','ocean','sunset','violet','forest','candy']];
        if(self::manager())$result['all_users']=array_map(static fn($u)=>['id'=>(int)$u->ID,'name'=>$u->display_name?:$u->user_login,'enabled'=>user_can($u->ID,self::CAP),'resettable'=>in_array('arkando_crm_operator',(array)(get_userdata($u->ID)->roles??[]),true) && !user_can($u->ID,'manage_options')],$users);
        // OntologyOS has its own authoritative CEO-only REST projection. Never query its SQL tables or copy its commercial records.
        if (self::manager()) {
            $r=rest_do_request(new WP_REST_Request('GET','/arkando-os/v1/charts'));
            $result['core_charts']=!is_wp_error($r)&&$r->get_status()===200?(array)$r->get_data():null;
        } else $result['core_charts']=null;
        return new WP_REST_Response($result);
    }
    private static function limit(string $s,int $n): string { if(function_exists('mb_substr')) return mb_substr($s,0,$n,'UTF-8'); $parts=preg_split('//u',$s,-1,PREG_SPLIT_NO_EMPTY); return $parts?implode('',array_slice($parts,0,$n)):substr($s,0,$n); }
    private static function clean($s,int $max=190): string { return self::limit(sanitize_text_field(is_scalar($s)?(string)$s:''),$max); }
    private static function digits(string $s): string { return strtr($s,['۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9','٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4','٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9']); }
    private static function norm_ig(string $s): string {
        $s=trim($s);
        if (preg_match('~^(?:https?://|(?:www\.)?instagram\.com/)~i',$s)) {
            $url=parse_url(preg_match('~^https?://~i',$s)?$s:'https://'.$s);
            if (!$url || !in_array(strtolower($url['host']??''),['instagram.com','www.instagram.com'],true) || isset($url['user']) || isset($url['pass']) || isset($url['port'])) return '';
            $path=trim($url['path']??'','/');
            if (str_contains($path,'/')) return '';
            $s=$path;
        }
        $s=strtolower(ltrim($s,'@ '));
        return preg_match('/^[a-z0-9._]{1,30}$/D',$s)?$s:'';
    }
    private static function norm_phone(string $s): string {
        $s=preg_replace('/[^0-9+]/','',self::digits($s));
        if (str_starts_with($s,'00')) $s='+'.substr($s,2);
        elseif (str_starts_with($s,'98')&&strlen($s)===12) $s='+'.$s;
        elseif (str_starts_with($s,'09')&&strlen($s)===11) $s='+98'.substr($s,1);
        elseif (str_starts_with($s,'9')&&strlen($s)===10) $s='+98'.$s;
        // Do not guess country for otherwise ambiguous numbers.
        return preg_match('/^\+?[0-9]{7,15}$/D',$s) ? $s : '';
    }
    private static function phones($raw): array {
        $p=preg_split('/[;,،\n\r\/]+/u',(string)$raw);$out=[];
        foreach($p?:[] as $x){$x=trim($x);$norm=self::norm_phone($x);if($norm)$out[$norm]=$x;}
        return $out;
    }
    private static function choice($value,array $allowed,string $default): string { $value=self::clean($value,60);return in_array($value,$allowed,true)?$value:$default; }
    private static function roles(): array { return ['buyer','supplier','producer','broker','logistics','interested','service','unknown']; }
    private static function stages(): array { return ['new','needs_info','qualified','ready_call','contacting','follow_up','negotiating','transferred','won','lost','archived']; }
    private static function comms(): array { return ['unknown','auto_sent','awaiting_reply','replied','contacted','no_answer','do_not_contact']; }
    private static function validations(): array { return ['unverified','checking','verified','rejected']; }
    private static function date_value($value): ?string {
        if (!$value) return null;
        $s=self::digits((string)$value);
        // Accept explicit ISO local datetime only. No fuzzy due-date guesses.
        if (!preg_match('/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/',$s)) return null;
        $d=DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',strlen($s)===10?$s.' 00:00:00':(strlen($s)===16?str_replace('T',' ',$s).':00':str_replace('T',' ',$s)),wp_timezone());
        if(!$d || $d->format('Y-m-d H:i:s') !== (strlen($s)===10?$s.' 00:00:00':(strlen($s)===16?str_replace('T',' ',$s).':00':str_replace('T',' ',$s)))) return null;
        return $d->format('Y-m-d H:i:s');
    }
    private static function request_data(WP_REST_Request $request): array|WP_Error {
        $data=$request->get_json_params();
        if(!is_array($data) || ($data && array_is_list($data)))return self::error('invalid_input','بدنه درخواست باید یک شیء JSON باشد.');
        $error=self::validate_fields($data);
        return $error?:$data;
    }
    private static function validate_fields(array $data): ?WP_Error {
        $limits=['display_name'=>190,'ig_username'=>255,'company'=>190,'email'=>190,'phone_raw'=>255,'external_key'=>190,'source_platform'=>50,'source_ref'=>255,'campaign'=>190,'opportunity_code'=>90,'product'=>190,'industry'=>190,'role_type'=>50,'stage'=>50,'comm_state'=>50,'verification'=>50,'priority'=>10,'next_action'=>255,'due_at'=>32,'notes'=>8000,'canonical_uuid'=>36,'summary'=>5000,'event_type'=>50,'idempotency_key'=>150];
        foreach($data as $field=>$value){
            if(!is_string($field) || (!is_scalar($value) && $value!==null))return self::error('invalid_input','هر فیلد باید مقدار ساده داشته باشد؛ آرایه یا شیء مجاز نیست.');
            if(is_string($value) && preg_match('//u',$value)!==1)return self::error('invalid_input','متن باید UTF-8 معتبر باشد.');
            if(isset($limits[$field]) && $value!==null && self::limit((string)$value,$limits[$field])!==(string)$value)return self::error('invalid_input','طول فیلد '.$field.' بیش از حد مجاز است.');
        }
        return null;
    }
    private static function unsigned_id($value): ?int {
        if(is_int($value))return $value>=0?$value:null;
        if(!is_string($value)||!preg_match('/^(?:0|[1-9][0-9]*)$/D',$value))return null;
        if(strlen($value)>strlen((string)PHP_INT_MAX)||(strlen($value)===strlen((string)PHP_INT_MAX)&&strcmp($value,(string)PHP_INT_MAX)>0))return null;
        return (int)$value;
    }
    private static function intake_error(array $data): ?WP_Error {
        if($error=self::validate_fields($data))return $error;
        $ig=trim((string)($data['ig_username']??''));
        if($ig!==''&&!self::norm_ig($ig))return self::error('invalid_instagram','آیدی یا نشانی پروفایل اینستاگرام معتبر نیست.');
        if(!self::norm_ig($ig)&&!self::phones((string)($data['phone_raw']??''))&&!self::clean($data['display_name']??''))return self::error('identity_required','حداقل آیدی معتبر، شماره یا نام لازم است.');
        if(!empty($data['due_at'])&&!self::date_value($data['due_at']))return self::error('invalid_due','تاریخ موعد باید ISO معتبر باشد.');
        return null;
    }
    private static function transactional_storage(): bool {
        global $wpdb;
        $tables=array_map([__CLASS__,'table'],['contacts','channels','leads','events']);
        $sql=$wpdb->prepare('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (%s,%s,%s,%s)',$tables);
        $rows=$wpdb->get_results($sql,ARRAY_A);
        if(!is_array($rows)||count($rows)!==count($tables))return false;
        foreach($rows as $row)if(strcasecmp((string)$row['ENGINE'],'InnoDB')!==0)return false;
        return true;
    }
    private static function existing_intake(string $external_key,string $digest): array|WP_Error|null {
        global $wpdb;
        $existing=$wpdb->get_row($wpdb->prepare('SELECT id,external_key FROM '.self::table('leads').' WHERE external_key=%s',$external_key),ARRAY_A);
        if($wpdb->last_error)return self::error('read_failed','خواندن شناسه منبع ناموفق بود؛ هیچ رکورد تازه‌ای ساخته نشد.',500);
        if($existing && $existing['external_key']!==$external_key)return self::error('idempotency_conflict','شناسه منبع با شناسه موجود از نظر دیتابیس یکسان است اما متن دقیق آن تفاوت دارد.',409);
        $key='intake:'.hash('sha256',$external_key);
        $repeated=$wpdb->get_row($wpdb->prepare('SELECT lead_id,change_json FROM '.self::table('events').' WHERE event_key=%s',$key),ARRAY_A);
        if($wpdb->last_error)return self::error('read_failed','خواندن سابقه ثبت ناموفق بود؛ هیچ رکورد تازه‌ای ساخته نشد.',500);
        if(!$existing&&!$repeated)return null;
        $saved=$repeated?json_decode((string)$repeated['change_json'],true):null;
        if(!empty($saved['intake_sha256'])&&!hash_equals((string)$saved['intake_sha256'],$digest))return self::error('idempotency_conflict','این شناسه ثبت قبلاً برای محتوای دیگری استفاده شده است؛ ابتدا نتیجه ثبت قبلی را بررسی کنید.',409);
        $result=['id'=>(int)($existing['id']??$repeated['lead_id']),'created'=>false,'reason'=>'source_already_imported'];
        // Historical source keys remain valid, but no original request digest exists to compare.
        if(empty($saved['intake_sha256']))$result['warning']='legacy_idempotency_unverified';
        return $result;
    }
    private static function source_key_collation(): ?array {
        global $wpdb;
        $column=$wpdb->get_row($wpdb->prepare('SELECT COLLATION_NAME,CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND COLUMN_NAME=%s',self::table('leads'),'external_key'),ARRAY_A);
        if(!$column)return null;
        foreach(['COLLATION_NAME','CHARACTER_SET_NAME'] as $name)if(!is_string($column[$name])||!preg_match('/^[a-zA-Z0-9_]+$/D',$column[$name]))return null;
        return $column;
    }
    private static function source_key_identity(string $key,array $column): ?string {
        global $wpdb;
        $collation=$column['COLLATION_NAME'];$charset=$column['CHARACTER_SET_NAME'];
        // Respect the existing column charset as well as its case/accent comparison rules.
        $identity=$wpdb->get_var($wpdb->prepare("SELECT HEX(WEIGHT_STRING(RTRIM(CONVERT(%s USING {$charset})) COLLATE {$collation}))",$key));
        return is_string($identity)?$identity:null;
    }
    private static function intake_digest(array $data,bool $import): string {
        // Fingerprint the submitted source, not mutable lead state. Retries remain valid after edits.
        $source=['import'=>$import];
        foreach(['display_name','ig_username','company','email','phone_raw','source_platform','source_ref','campaign','opportunity_code','product','industry','role_type','priority','next_action','due_at','notes'] as $field)$source[$field]=(string)($data[$field]??'');
        return hash('sha256',wp_json_encode($source,JSON_UNESCAPED_UNICODE));
    }
    private static function contact_for(array $input): array {
        global $wpdb; $t=self::table('contacts');$ch=self::table('channels');
        $ig=self::norm_ig((string)($input['ig_username']??''));
        // Keep line boundaries: flattening them can concatenate two valid phone numbers.
        $raw=trim(sanitize_textarea_field((string)($input['phone_raw']??'')));
        $phones=self::phones($raw);$phone=array_key_first($phones)??'';
        $contact=0;$warning='';$matches=[];
        if($ig){$contact=(int)$wpdb->get_var($wpdb->prepare("SELECT id FROM {$t} WHERE ig_username=%s",$ig));if($wpdb->last_error)throw new RuntimeException('identity_read_failed');}
        foreach(array_keys($phones) as $number){
            $rows=$wpdb->get_results($wpdb->prepare("SELECT DISTINCT c.id,c.ig_username FROM {$t} c JOIN {$ch} ch ON c.id=ch.contact_id WHERE ch.channel_type='phone' AND ch.normalized_value=%s",$number),ARRAY_A);
            if($wpdb->last_error)throw new RuntimeException('identity_read_failed');
            foreach($rows as $row)$matches[(int)$row['id']]=$row;
        }
        if($contact){
            foreach($matches as $id=>$row)if($id!==$contact)$warning='shared_phone_review';
        } elseif(count($matches)===1){
            $candidate=reset($matches);
            if(!$ig || empty($candidate['ig_username']) || $candidate['ig_username']===$ig)$contact=(int)$candidate['id'];
            else $warning='shared_phone_review';
        } elseif(count($matches)>1)$warning='shared_phone_review';
        if($raw!==''&&!$phones)$warning=$warning?:'phone_unverified';
        $name=self::clean($input['display_name']??'');$company=self::clean($input['company']??'');$email=sanitize_email($input['email']??'');
        if(!$contact){
            $ok=$wpdb->insert($t,['display_name'=>$name,'ig_username'=>$ig?:null,'company'=>$company,'email'=>$email,'phone_raw'=>$raw,'phone_normalized'=>$phone,'created_at'=>self::now(),'updated_at'=>self::now()]);
            if(!$ok)return ['id'=>0,'warning'=>'database_write_failed'];
            $contact=(int)$wpdb->insert_id;
        } else {
            $old=$wpdb->get_row($wpdb->prepare("SELECT * FROM {$t} WHERE id=%d",$contact),ARRAY_A);
            if($wpdb->last_error||!$old)throw new RuntimeException('identity_read_failed');
            $patch=[];
            foreach(['display_name'=>$name,'ig_username'=>$ig?:null,'company'=>$company,'email'=>$email,'phone_raw'=>$raw,'phone_normalized'=>$phone] as $k=>$v) if($v!==null&&$v!==''&&empty($old[$k]))$patch[$k]=$v;
            if($patch){$patch['updated_at']=self::now();if($wpdb->update($t,$patch,['id'=>$contact])===false)throw new RuntimeException('contact_update_failed');}
        }
        foreach($phones as $normal=>$original) self::checked_query($wpdb->prepare("INSERT INTO {$ch} (contact_id,channel_type,raw_value,normalized_value,verification,source_label,created_at) VALUES (%d,'phone',%s,%s,'unverified',%s,%s) ON DUPLICATE KEY UPDATE id=id",$contact,self::clean($original),$normal,self::clean($input['source_ref']??'',190),self::now()));
        if($ig) self::checked_query($wpdb->prepare("INSERT INTO {$ch} (contact_id,channel_type,raw_value,normalized_value,verification,source_label,created_at) VALUES (%d,'instagram',%s,%s,'unverified',%s,%s) ON DUPLICATE KEY UPDATE id=id",$contact,'@'.$ig,$ig,self::clean($input['source_ref']??'',190),self::now()));
        return ['id'=>$contact,'warning'=>$warning];
    }
    private static function write_event(int $lead,int $actor,string $type,string $summary='',array $changes=[],?string $event_key=null): void {
        global $wpdb;$ok=$wpdb->insert(self::table('events'),['lead_id'=>$lead,'actor_id'=>$actor,'event_type'=>$type,'event_key'=>$event_key,'summary'=>self::limit(wp_strip_all_tags($summary),8000),'change_json'=>wp_json_encode($changes,JSON_UNESCAPED_UNICODE),'occurred_at'=>self::now()]);
        if($ok===false)throw new RuntimeException('event_write_failed');
    }
    private static function checked_query(string $sql): int|bool {global $wpdb;$r=$wpdb->query($sql);if($r===false)throw new RuntimeException('channel_write_failed');return $r;}
    private static function atomic(callable $work,bool $intake_lock=false) {
        global $wpdb;
        if(!self::transactional_storage())return self::error('storage_not_transactional','ذخیره متوقف شد: هر چهار جدول CRM باید InnoDB باشند. پس از پشتیبان‌گیری، وضعیت ذخیره‌سازی را بررسی کنید.',503);
        $lock='arkando-crm-'.substr(hash('sha256',$wpdb->prefix),0,32);
        if($intake_lock && (string)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,5)',$lock))!=='1')return self::error('intake_busy','ثبت هم‌زمان در جریان است؛ دوباره تلاش کنید.',409);
        try {
            if($wpdb->query('START TRANSACTION')===false)return self::error('transaction_failed','ثبت تراکنش آغاز نشد.',500);
            $result=$work();
            if(is_wp_error($result)){$wpdb->query('ROLLBACK');return $result;}
            if($wpdb->query('COMMIT')===false){$wpdb->query('ROLLBACK');return self::error('commit_failed','نتیجه ذخیره باید دوباره بررسی شود.',500);}
            return $result;
        } catch(Throwable $e){$wpdb->query('ROLLBACK');error_log('[ArkanDo CRM] '.$e->getMessage());return self::error('write_rolled_back','ذخیره کامل نشد؛ تغییرات این عملیات برگشت خورد. دوباره تلاش کنید.',500);}
        finally {if($intake_lock)$wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock));}
    }
    private static function create(array $data,string $external_key='',bool $import=false): array|WP_Error {
        if($error=self::intake_error($data))return $error;
        if($external_key!=='' && (self::limit($external_key,190)!==$external_key||preg_match('/[\x00-\x1f\x7f]/',$external_key)||$external_key!==trim($external_key)))return self::error('invalid_input','شناسه منبع بیش از حد مجاز است.');
        if(!self::manager() && array_intersect(array_keys($data),['owner_id','backup_id','next_action','due_at','priority','verification','canonical_uuid']))return self::error('ceo_task_only','تعیین مسئول، وظیفه، موعد و اولویت با مدیرعامل است.',403);
        return self::atomic(static fn()=>self::create_in_transaction($data,$external_key,$import),true);
    }
    private static function create_in_transaction(array $data,string $external_key='',bool $import=false): array|WP_Error {
        global $wpdb;$t=self::table('leads');
        $external_key=$external_key?:'manual:'.wp_generate_uuid4();
        $digest=self::intake_digest($data,$import);$intake_key='intake:'.hash('sha256',$external_key);
        $existing=self::existing_intake($external_key,$digest);
        if($existing!==null)return $existing;
        $contact=self::contact_for($data);if(!$contact['id'])return self::error('contact_failed','ثبت مخاطب ناموفق بود.',500);
        // Existing person may have several distinct opportunities; duplicate same source campaign is not a new lead.
        $op=self::clean($data['opportunity_code']??'',90);
        if($op!==''&&!$import){
            $dup=$wpdb->get_var($wpdb->prepare("SELECT id FROM {$t} WHERE contact_id=%d AND opportunity_code=%s AND stage NOT IN ('archived','lost') ORDER BY id DESC LIMIT 1",$contact['id'],$op));
            if($wpdb->last_error)throw new RuntimeException('opportunity_read_failed');
            if($dup){
                $summary=sanitize_textarea_field($data['notes']??'');
                self::write_event((int)$dup,get_current_user_id(),'repeat_intake',$summary?:self::clean($data['source_ref']??'',255),['source_ref'=>self::clean($data['source_ref']??'',255),'intake_sha256'=>$digest,'intake_source'=>$data],$intake_key);
                self::checked_query($wpdb->prepare("UPDATE {$t} SET updated_at=%s,revision=revision+1 WHERE id=%d",self::now(),(int)$dup));
                return ['id'=>(int)$dup,'created'=>false,'reason'=>'same_person_opportunity'];
            }
        }
        $stage='new'; // Initial intake is never automatically qualified, contacted, or won.
        $note=self::limit(sanitize_textarea_field($data['notes']??''),8000);
        $row=['contact_id'=>$contact['id'],'external_key'=>$external_key,
            'source_platform'=>self::clean($data['source_platform']??'instagram',50),'source_ref'=>self::clean($data['source_ref']??'',255),
            'campaign'=>self::clean($data['campaign']??''),'opportunity_code'=>$op,'product'=>self::clean($data['product']??''),
            'industry'=>self::clean($data['industry']??''),'role_type'=>self::choice($data['role_type']??'unknown',self::roles(),'unknown'),
            'stage'=>$stage,'comm_state'=>'unknown',
            'verification'=>'unverified',
            'priority'=>self::manager()?self::choice($data['priority']??'P3',['P1','P2','P3'],'P3'):'P3',
            'owner_id'=>0,'backup_id'=>0,'progress'=>0,'next_action'=>self::clean($data['next_action']??'',255),
            'due_at'=>self::date_value($data['due_at']??null), 'notes'=>$note,'revision'=>1,'created_at'=>self::now(),'updated_at'=>self::now()];
        $ok=$wpdb->insert($t,$row);if(!$ok)return self::error('lead_failed','ثبت درخواست ناموفق بود.',500);
        $id=(int)$wpdb->insert_id;self::write_event($id,get_current_user_id(),$import?'csv_import':'created',($contact['warning']??'')?:'ثبت اولیه',['intake_sha256'=>$digest,'intake_source'=>$data],$intake_key);
        return ['id'=>$id,'created'=>true,'contact_id'=>$contact['id'],'warning'=>$contact['warning']];
    }
    public static function create_lead(WP_REST_Request $r) {
        $data=self::request_data($r);if(is_wp_error($data))return $data;$key=(string)($data['external_key']??'');unset($data['external_key']);
        if(!self::manager() && (array_key_exists('next_action',$data)||array_key_exists('due_at',$data)))return self::error('ceo_task_only','تعیین وظیفه و موعد با مدیرعامل است؛ پیشنهاد خود را در یادداشت ثبت کنید.',403);
        return self::create($data,$key);
    }
    private static function get_lead(int $id): ?array {
        global $wpdb;$l=self::table('leads');$c=self::table('contacts');
        return $wpdb->get_row($wpdb->prepare("SELECT l.*,c.display_name,c.ig_username,c.company,c.email,c.phone_raw,c.phone_normalized FROM {$l} l LEFT JOIN {$c} c ON l.contact_id=c.id WHERE l.id=%d",$id),ARRAY_A) ?:null;
    }
    public static function leads(WP_REST_Request $r): WP_REST_Response {
        global $wpdb;$l=self::table('leads');$c=self::table('contacts');
        $id=absint($r->get_param('id'));if($id)return new WP_REST_Response(['items'=>array_filter([self::get_lead($id)]),'total'=>self::get_lead($id)?1:0]);
        $page=max(1,absint($r->get_param('page')));$per=min(200,max(1,absint($r->get_param('per_page')?:100)));
        $where='1=1';$params=[];$stage=self::clean($r->get_param('stage')??'',50);$owner=absint($r->get_param('owner'));
        if($stage){$where.=' AND l.stage=%s';$params[]=$stage;}
        if($owner){$where.=' AND l.owner_id=%d';$params[]=$owner;}
        $search=self::digits(self::clean($r->get_param('search')??'',90));
        if($search){$where.=' AND (c.display_name LIKE %s OR c.ig_username LIKE %s OR c.phone_raw LIKE %s OR c.phone_normalized LIKE %s OR EXISTS (SELECT 1 FROM '.self::table('channels').' sch WHERE sch.contact_id=c.id AND sch.normalized_value LIKE %s) OR l.product LIKE %s OR l.opportunity_code LIKE %s)';$like='%'.$wpdb->esc_like($search).'%';$params=array_merge($params,[$like,$like,$like,$like,$like,$like,$like]);}
        $count_sql="SELECT COUNT(*) FROM {$l} l LEFT JOIN {$c} c ON l.contact_id=c.id WHERE {$where}";
        $total=(int)$wpdb->get_var($params?$wpdb->prepare($count_sql,$params):$count_sql);
        $sql="SELECT l.*, c.display_name,c.ig_username,c.company,c.email,c.phone_raw,c.phone_normalized FROM {$l} l LEFT JOIN {$c} c ON l.contact_id=c.id WHERE {$where} ORDER BY l.updated_at DESC,l.id DESC LIMIT %d OFFSET %d";
        $items=$wpdb->get_results($wpdb->prepare($sql,array_merge($params,[$per,($page-1)*$per])),ARRAY_A);
        return new WP_REST_Response(['items'=>$items,'total'=>$total,'page'=>$page,'per_page'=>$per]);
    }
    public static function analytics(): WP_REST_Response {
        global $wpdb;$l=self::table('leads');$c=self::table('contacts');$e=self::table('events');
        $lead_rows=$wpdb->get_results("SELECT id,contact_id,source_platform,campaign,source_ref,opportunity_code,product,industry,role_type,stage,comm_state,verification,priority,owner_id,backup_id,progress,next_action,due_at,last_contact_at,contact_attempts,canonical_uuid,created_at,updated_at FROM {$l} ORDER BY id DESC LIMIT 12000",ARRAY_A);
        $total=(int)$wpdb->get_var("SELECT COUNT(*) FROM {$l}");
        $contact_total=(int)$wpdb->get_var("SELECT COUNT(*) FROM {$c}");
        $events=$wpdb->get_results("SELECT event_type,DATE(occurred_at) as date,COUNT(*) AS count FROM {$e} GROUP BY event_type,DATE(occurred_at) ORDER BY date DESC LIMIT 3000",ARRAY_A);
        return new WP_REST_Response(['rows'=>$lead_rows,'total'=>$total,'contacts'=>$contact_total,'events'=>$events,'truncated'=>$total>count($lead_rows),'generated_at'=>self::now()]);
    }
    public static function update_lead(WP_REST_Request $r) {
        return self::atomic(static fn()=>self::update_lead_in_transaction($r));
    }
    private static function update_lead_in_transaction(WP_REST_Request $r) {
        global $wpdb;$id=absint($r['id']);$prior=self::get_lead($id);if(!$prior)return self::error('not_found','پرونده پیدا نشد.',404);
        $data=self::request_data($r);if(is_wp_error($data))return $data;
        $expected_revision=self::unsigned_id($data['revision']??0);
        if(!$expected_revision)return self::error('revision_required','برای جلوگیری از تداخل تغییرات، نسخه پرونده الزامی است.',409);
        if((int)$prior['revision']!==$expected_revision)return self::error('stale_revision','این پرونده توسط شخص دیگری تغییر کرده است؛ دوباره باز کنید.',409);
        if(!self::manager() && array_intersect(array_keys($data),['owner_id','backup_id','next_action','due_at','priority','verification','canonical_uuid']))return self::error('ceo_task_only','تعیین مسئول، وظیفه، موعد و اولویت با مدیرعامل است.',403);
        $allowed=['stage','comm_state','progress','notes'];
        if(self::manager())$allowed=array_merge($allowed,['owner_id','backup_id','next_action','due_at','verification','priority','canonical_uuid','opportunity_code','product','industry','role_type','campaign','source_ref']);
        $patch=[];$diff=[];
        foreach($allowed as $f){
            if(!array_key_exists($f,$data))continue;
            $v=$data[$f];
            if($f==='stage')$v=self::choice($v,self::stages(),$prior[$f]);
            elseif($f==='comm_state')$v=self::choice($v,self::comms(),$prior[$f]);
            elseif($f==='verification')$v=self::choice($v,self::validations(),$prior[$f]);
            elseif($f==='role_type')$v=self::choice($v,self::roles(),$prior[$f]);
            elseif($f==='priority')$v=self::choice($v,['P1','P2','P3'],$prior[$f]);
            elseif($f==='owner_id'||$f==='backup_id'){$v=self::unsigned_id($v);if($v===null)return self::error('invalid_owner','شناسه مسئول باید عدد صحیح نامنفی باشد.');if($v && !user_can($v,self::CAP))return self::error('invalid_owner','کاربر مسئول دسترسی CRM ندارد.');}
            elseif($f==='progress'){$v=self::unsigned_id($v);if($v===null||$v>100)return self::error('invalid_progress','پیشرفت باید عدد صحیح بین صفر و صد باشد.');}
            elseif($f==='due_at'){$v=$v?self::date_value($v):null;if($data[$f]&&!$v)return self::error('invalid_due','تاریخ موعد باید ISO معتبر باشد.');}
            elseif($f==='notes')$v=self::limit(sanitize_textarea_field($v),8000);
            elseif($f==='canonical_uuid'){$v=strtolower(self::clean($v,36));if($v && !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D',$v))return self::error('invalid_uuid','شناسه پرونده مرکزی نامعتبر است.');}
            else $v=self::clean($v,in_array($f,['next_action','source_ref'],true)?255:($f==='opportunity_code'?90:190));
            if((string)($prior[$f]??'')!==(string)($v??'')){$patch[$f]=$v;$diff[$f]=['from'=>$prior[$f],'to'=>$v];}
        }
        if(!self::manager() && isset($patch['stage']) && (in_array($patch['stage'],['negotiating','transferred','won','lost','archived'],true)||in_array($prior['stage'],['negotiating','transferred','won','lost','archived'],true))) return self::error('manager_only_transition','تأیید مراحل تجاری و بایگانی با مدیرعامل است.',403);
        $final=array_merge($prior,$patch);
        if(in_array($final['stage'],['ready_call','contacting','follow_up','negotiating'],true) && (!$final['owner_id'] || !$final['next_action'] || !$final['due_at']))return self::error('followup_incomplete','برای مرحله فعال، مسئول، اقدام بعدی و موعد باید مشخص باشد.');
        if(!$diff)return new WP_REST_Response(['ok'=>true,'unchanged'=>true]);
        if(($patch['stage']??'')==='won')return self::error('canonical_won_only','موفقیت معامله فقط در هسته تجاری ثبت می‌شود و از اینجا قابل اعلام نیست.');
        if($final['stage']==='transferred' && empty($final['canonical_uuid']))return self::error('canonical_required','برای تحویل تجاری ابتدا UUID معتبر پرونده اصلی را وارد کنید.');
        if(!empty($patch['canonical_uuid'])||($patch['stage']??'')==='transferred'){
            $check=rest_do_request(new WP_REST_Request('GET','/arkando-os/v1/objects/'.$final['canonical_uuid']));
            if(is_wp_error($check) || $check->get_status()!==200)return self::error('canonical_not_found','پرونده مرکزی با این شناسه در هسته معتبر تأیید نشد.');
            $core=(array)$check->get_data();
            if(!in_array($core['object']['object_type']??'', ['CASE','OPPORTUNITY'],true))return self::error('not_commercial_case','فقط CASE یا OPPORTUNITY معتبر در هسته تجاری قابل اتصال است.');
        }
        // Staff may not forge owner or commercial validations; explicit manager assignments are logged.
        $patch['updated_at']=self::now();$patch['revision']=$expected_revision+1;
        $ok=$wpdb->update(self::table('leads'),$patch,['id'=>$id,'revision'=>$expected_revision]);
        if($ok===false)return self::error('update_failed','ذخیره تغییرات ناموفق بود.',500);
        if($ok===0)return self::error('stale_revision','تغییر هم‌زمان شناسایی شد؛ صفحه را دوباره باز کنید.',409);
        self::write_event($id,get_current_user_id(),'updated','تغییر وضعیت / اطلاعات',$diff);
        return new WP_REST_Response(['ok'=>true,'lead'=>self::get_lead($id)]);
    }
    public static function get_events(WP_REST_Request $r) {
        global $wpdb;$id=absint($r['id']);
        if(!self::get_lead($id))return self::error('not_found','پرونده پیدا نشد.',404);
        $per=self::unsigned_id($r->get_param('per_page')??100);$before=self::unsigned_id($r->get_param('before_id')??0);
        if(!$per||$per>200||$before===null)return self::error('invalid_input','پارامتر صفحه‌بندی سابقه معتبر نیست.');
        $e=self::table('events');$where='lead_id=%d';$params=[$id];
        if($before){$where.=' AND id<%d';$params[]=$before;}
        $params[]=$per+1;
        $rows=$wpdb->get_results($wpdb->prepare("SELECT id,actor_id,event_type,summary,change_json,occurred_at FROM {$e} WHERE {$where} ORDER BY id DESC LIMIT %d",$params),ARRAY_A);
        if($wpdb->last_error||!is_array($rows))return self::error('read_failed','خواندن سابقه ناموفق بود.',500);
        $more=count($rows)>$per;if($more)array_pop($rows);
        foreach($rows as &$row){$actor=get_userdata((int)$row['actor_id']);$row['actor_name']=$actor?($actor->display_name?:$actor->user_login):((int)$row['actor_id']?'کاربر حذف‌شده #'.$row['actor_id']:'سامانه');}unset($row);
        $total=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$e} WHERE lead_id=%d",$id));
        return new WP_REST_Response(['items'=>$rows,'total'=>$total,'per_page'=>$per,'next_before_id'=>$more?(int)$rows[count($rows)-1]['id']:null]);
    }
    public static function add_event(WP_REST_Request $r) {
        return self::atomic(static function()use($r){
            global $wpdb;$id=absint($r['id']);$table=self::table('leads');
            $prior=$wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id=%d FOR UPDATE",$id),ARRAY_A);
            if(!$prior)return self::error('not_found','پرونده پیدا نشد.',404);
            $data=self::request_data($r);if(is_wp_error($data))return $data;$type=self::choice($data['event_type']??'note',['note','dm_sent','dm_received','call','call_no_answer','handoff','document','whatsapp'],'note');
            $summary=self::limit(sanitize_textarea_field($data['summary']??''),5000);if(!$summary)return self::error('summary_required','نتیجه فعالیت را بنویسید.');
            $event_key=self::clean($data['idempotency_key']??'',150);
            $event_key=$event_key!==''?'lead:'.$id.':'.$event_key:null;
            if($event_key){$e=$wpdb->get_row($wpdb->prepare('SELECT event_type,summary FROM '.self::table('events').' WHERE event_key=%s',$event_key),ARRAY_A);if($e){if($e['event_type']!==$type||$e['summary']!==$summary)return self::error('event_key_reused','شناسه فعالیت برای محتوای دیگری استفاده شده است.',409);return new WP_REST_Response(['ok'=>true,'reused'=>true]);}}
            if(isset($data['revision']) && self::unsigned_id($data['revision'])!==(int)$prior['revision'])return self::error('stale_revision','پرونده تغییر کرده است؛ پیش از ثبت فعالیت آن را دوباره باز کنید.',409);
            $ok=$wpdb->insert(self::table('events'),['lead_id'=>$id,'actor_id'=>get_current_user_id(),'event_type'=>$type,'event_key'=>$event_key,'summary'=>$summary,'change_json'=>null,'occurred_at'=>self::now()]);
            if($ok===false)throw new RuntimeException('activity_insert_failed');
            $comm=match($type){'dm_received'=>'replied','call'=>'contacted','call_no_answer'=>'no_answer',default=>$prior['comm_state']};
            if(in_array($type,['call','call_no_answer'],true))self::checked_query($wpdb->prepare("UPDATE {$table} SET contact_attempts=contact_attempts+1,last_contact_at=%s,comm_state=%s,updated_at=%s,revision=revision+1 WHERE id=%d",self::now(),$comm,self::now(),$id));
            else self::checked_query($wpdb->prepare("UPDATE {$table} SET comm_state=%s,updated_at=%s,revision=revision+1 WHERE id=%d",$comm,self::now(),$id));
            return new WP_REST_Response(['ok'=>true,'lead'=>self::get_lead($id)]);
        });
    }
    private static function map_import_role(string $s): string {
        if(str_contains($s,'تولید'))return 'producer';
        if(str_contains($s,'تأمین')||str_contains($s,'تامين'))return 'supplier';
        if(str_contains($s,'خریدار'))return 'buyer';
        if(str_contains($s,'لجستیک'))return 'logistics';
        if(str_contains($s,'کارگزار')||str_contains($s,'بازاریاب')||str_contains($s,'واسط'))return 'broker';
        if(str_contains($s,'خدمات'))return 'service';
        if(str_contains($s,'متقاضی')||str_contains($s,'آموزش'))return 'interested';return 'unknown';
    }
    public static function import_csv(WP_REST_Request $r) {
        global $wpdb;$body=self::request_data($r);if(is_wp_error($body))return $body;$csv=(string)($body['csv']??'');
        if(!$csv||strlen($csv)>self::MAX_IMPORT)return self::error('invalid_csv','فایل CSV خالی یا بزرگ‌تر از ۲ مگابایت است.');
        $dry_run=!empty($body['dry_run']);
        $fh=fopen('php://temp','w+');if(!$fh)return self::error('csv_read_failed','خواندن CSV ناموفق بود.',500);
        fwrite($fh,preg_replace('/^\xEF\xBB\xBF/','',$csv));rewind($fh);
        $header=fgetcsv($fh,0,',','"','');if(!$header){fclose($fh);return self::error('csv_header','سربرگ CSV یافت نشد.');}
        $header=array_map(fn($x)=>trim((string)$x),$header);
        if(count(array_unique($header))!==count($header)||in_array('',$header,true)){fclose($fh);return self::error('csv_schema','سربرگ تکراری یا خالی مجاز نیست.');}
        $idx=array_flip($header);$results=['created'=>0,'skipped'=>0,'errors'=>[],'review'=>0,'processed'=>0,'dry_run'=>$dry_run,'file_sha256'=>hash('sha256',$csv)];
        if(!isset($idx['شناسه'])&&!isset($idx['آیدی اینستاگرام'])){fclose($fh);return self::error('csv_schema','سربرگ فایل با آرشیو آرکاندو سازگار نیست.');}
        $rows=[];
        while(($cols=fgetcsv($fh,0,',','"',''))!==false){
            if(!$cols||count($cols)===1&&trim((string)$cols[0])==='')continue;
            $rows[]=$cols;
            if(count($rows)>1500){fclose($fh);return self::error('csv_row_limit','فایل بیشتر از ۱۵۰۰ ردیف دارد؛ آن را به چند فایل تقسیم کنید. هیچ ردیفی وارد نشد.');}
        }
        fclose($fh);$seen=[];$collation=self::source_key_collation();
        if(!$collation)return self::error('csv_read_failed','ساختار شناسه منبع قابل بررسی نیست؛ هیچ ردیفی وارد نشد.',500);
        // Parsing, identity validation, and key decisions are identical for preview and apply.
        foreach($rows as $index=>$cols){
            $n=$index+1;$results['processed']++;
            if(count($cols)!==count($header)){$results['errors'][]=['row'=>$n,'reason'=>'تعداد ستون‌های ردیف با سربرگ برابر نیست.'];continue;}
            $get=static fn(string $k)=>isset($idx[$k])?trim((string)($cols[$idx[$k]]??'')):'';
            $key=$get('شناسه');
            if($key===''){
                $key='row-sha256:'.hash('sha256',wp_json_encode($cols,JSON_UNESCAPED_UNICODE));
                // Recognize older positional fallback keys without changing historical source identifiers.
                $suffix=substr(hash('sha256',implode('|',$cols)),0,20);
                $old=$wpdb->get_col($wpdb->prepare('SELECT external_key FROM '.self::table('leads')." WHERE external_key LIKE %s LIMIT 2",'archive20261020:row-%-'.$suffix));
                if($wpdb->last_error)return self::error('read_failed','خواندن شناسه آرشیو ناموفق بود.',500);
                if(count($old)===1)$key=substr($old[0],strlen('archive20261020:'));
            }
            $external_key='archive20261020:'.$key;
            $raw=$get('شماره تماس (عین متن خوانده‌شده)')?:$get('شماره قابل استفاده (نیازمند تأیید)');
            $original_ig=$get('آیدی اینستاگرام');$ig=self::norm_ig($original_ig);
            $note=$get('خلاصه پیام/تصاویر');$extra=$get('ملاحظات و ابهام');if($extra)$note.="\nابهام: ".$extra;
            if($original_ig!==''&&!$ig)$note.="\nآیدی خوانده‌شده از منبع (نیازمند بررسی): ".$original_ig;
            foreach(['خلاصه پاسخ یا راهنمایی'=>'خلاصه پاسخ/پیشنهاد قدیمی','مدرک ارسال پاسخ'=>'مدرک ارسال پاسخ','تاریخ ثبت'=>'تاریخ ثبت در منبع','مرحله CRM'=>'مرحله آرشیوی (نه وضعیت زنده)'] as $column=>$label){$value=$get($column);if($value)$note.="\n".$label.': '.$value;}
            $data=['display_name'=>$get('نام نمایشی'),'ig_username'=>$ig,'phone_raw'=>$raw,'role_type'=>self::map_import_role($get('دسته‌بندی')),
                'source_ref'=>$get('فایل‌های منبع')?:'Instagram archive 2026-10-20','source_platform'=>'instagram','priority'=>$get('اولویت'),
                'next_action'=>$get('اقدام بعدی'),'notes'=>$note,'stage'=>'new','comm_state'=>'unknown'];
            $error=self::intake_error($data);
            if(self::limit($external_key,190)!==$external_key)$error=self::error('invalid_input','شناسه منبع بیش از حد مجاز است.');
            if($error){$results['errors'][]=['row'=>$n,'reason'=>$error->get_error_message()];continue;}
            $digest=self::intake_digest($data,true);
            $identity=self::source_key_identity($external_key,$collation);
            if($identity===null)return self::error('csv_read_failed','مقایسه شناسه منبع ناموفق بود.',500);
            if(isset($seen[$identity])){
                if($seen[$identity]['key']===$external_key && hash_equals($seen[$identity]['digest'],$digest))$results['skipped']++;
                else $results['errors'][]=['row'=>$n,'reason'=>'شناسه تکراری فایل برای دو محتوای متفاوت استفاده شده است.'];
                continue;
            }
            if($dry_run){
                $out=self::existing_intake($external_key,$digest);
                if(is_wp_error($out)&&$out->get_error_code()==='read_failed')return $out;
                if($out===null)$out=['created'=>true];
            } else $out=self::create($data,$external_key,true);
            if(is_wp_error($out)){$results['errors'][]=['row'=>$n,'reason'=>$out->get_error_message()];continue;}
            $seen[$identity]=['key'=>$external_key,'digest'=>$digest];
            if($out['created'])$results['created']++;else $results['skipped']++;
            if(!empty($out['warning'])||($raw!==''&&!self::phones($raw)))$results['review']++;
        }
        return new WP_REST_Response($results);
    }
    public static function reassign(WP_REST_Request $r) {
        global $wpdb;
        $body=self::request_data($r);if(is_wp_error($body))return $body;
        $from=self::unsigned_id($body['from_id']??0);$to=self::unsigned_id($body['to_id']??0);
        if($from===null||$to===null)return self::error('invalid_owner','شناسه مسئول باید عدد صحیح نامنفی باشد.');
        $mode=self::choice($body['mode']??'preview',['preview','apply'],'preview');
        if($from===$to)return self::error('same_owner','مبدأ و مقصد نمی‌توانند یکسان باشند.');
        if($to && !user_can($to,self::CAP))return self::error('no_access','جانشین هنوز دسترسی CRM ندارد.');
        $table=self::table('leads');$where="owner_id=%d AND stage NOT IN ('archived','won','lost','transferred')";
        $count=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}",$from));
        if($wpdb->last_error)return self::error('read_failed','خواندن پرونده‌های انتقال ناموفق بود.',500);
        $blocked=0;
        if(!$to)$blocked=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where} AND stage IN ('ready_call','contacting','follow_up','negotiating')",$from));
        if($wpdb->last_error)return self::error('read_failed','خواندن پرونده‌های انتقال ناموفق بود.',500);
        if($mode==='preview')return new WP_REST_Response(['ok'=>$blocked===0,'count'=>$count,'blocked'=>$blocked,'applied'=>false,'truncated'=>false]);
        // Bound memory with keyset batches; every eligible row is considered, with no silent 10,000-row cutoff.
        $last=0;$updated=0;$failed=[];$skipped=0;
        $ceiling=(int)$wpdb->get_var($wpdb->prepare("SELECT MAX(id) FROM {$table} WHERE {$where}",$from));
        if($wpdb->last_error)return self::error('read_failed','خواندن پرونده‌های انتقال ناموفق بود.',500);
        do {
            $ids=$wpdb->get_col($wpdb->prepare("SELECT id FROM {$table} WHERE {$where} AND id>%d AND id<=%d ORDER BY id ASC LIMIT 500",$from,$last,$ceiling));
            if($wpdb->last_error)return new WP_REST_Response(['ok'=>false,'count'=>$count,'updated'=>$updated,'failed'=>$failed,'skipped'=>$skipped,'applied'=>true,'truncated'=>true,'message'=>'خواندن ادامه پرونده‌ها ناموفق بود؛ نتیجه جزئی است.'],500);
            foreach($ids as $raw_id){
                $id=(int)$raw_id;$last=$id;
                $out=self::atomic(static function()use($wpdb,$table,$id,$from,$to){
                    $prior=$wpdb->get_row($wpdb->prepare("SELECT owner_id,stage FROM {$table} WHERE id=%d FOR UPDATE",$id),ARRAY_A);
                    if($wpdb->last_error)throw new RuntimeException('reassign_read_failed');
                    if(!$prior||(int)$prior['owner_id']!==$from||in_array($prior['stage'],['archived','won','lost','transferred'],true))return false;
                    if(!$to&&in_array($prior['stage'],['ready_call','contacting','follow_up','negotiating'],true))return self::error('owner_required','پرونده فعال باید مسئول داشته باشد.');
                    $ok=$wpdb->query($wpdb->prepare("UPDATE {$table} SET owner_id=%d,updated_at=%s,revision=revision+1 WHERE id=%d AND owner_id=%d AND stage NOT IN ('archived','won','lost','transferred')",$to,self::now(),$id,$from));
                    if($ok===false)throw new RuntimeException('reassign_failed');
                    if($ok)self::write_event($id,get_current_user_id(),'reassigned','واگذاری گروهی مسئول',['owner_id'=>['from'=>$from,'to'=>$to]]);
                    return (bool)$ok;
                });
                if(is_wp_error($out))$failed[]=$id;elseif($out)$updated++;else $skipped++;
            }
        }while(count($ids)===500);
        return new WP_REST_Response(['ok'=>!$failed,'count'=>$count,'updated'=>$updated,'failed'=>$failed,'skipped'=>$skipped,'applied'=>true,'truncated'=>false]);
    }
    public static function save_settings(WP_REST_Request $r) {
        $data=self::request_data($r);if(is_wp_error($data))return $data;$user=self::unsigned_id($data['user_id']??0);
        if($user===null)return self::error('invalid_user','شناسه کاربر معتبر نیست.');
        if($user && get_user_by('id',$user)){
            $enabled=!empty($data['enabled']);$u=new WP_User($user);
            if($user===self::ceo_id()&&!$enabled)return self::error('protected_ceo','دسترسی مدیرعامل قابل حذف نیست.');
            if($enabled)$u->add_cap(self::CAP,true);else $u->add_cap(self::CAP,false);
            return new WP_REST_Response(['ok'=>true,'user_id'=>$user,'enabled'=>$enabled]);
        }
        return self::error('invalid_user','کاربر معتبر نیست.');
    }

    public static function create_staff(WP_REST_Request $request) {
        if(!self::manager())return self::error('forbidden','فقط مدیرعامل می‌تواند حساب کارکنان بسازد.',403);
        $data=self::request_data($request);if(is_wp_error($data))return $data;
        $raw=(string)($data['username']??''); $username=sanitize_user($raw,true);
        if(!preg_match('/^[a-zA-Z][a-zA-Z0-9._-]{2,31}$/',$username) || $raw!==$username)
            return self::error('invalid_username','نام کاربری باید با حرف لاتین شروع شود و ۳ تا ۳۲ کاراکتر باشد.');
        if(username_exists($username))return self::error('username_taken','این نام کاربری قبلاً ثبت شده است.',409);
        $email=trim((string)($data['email']??''));
        if($email && (!is_email($email) || email_exists($email)))return self::error('invalid_email','ایمیل معتبر و غیرتکراری وارد کنید یا خالی بگذارید.');
        $name=self::clean($data['display_name']??$username,100);
        $password=wp_generate_password(22,true,true);
        $args=['user_login'=>$username,'user_pass'=>$password,'display_name'=>$name,'user_email'=>$email,'role'=>'arkando_crm_operator'];
        $id=wp_insert_user($args);
        if(is_wp_error($id))return self::error('create_failed',$id->get_error_message(),400);
        update_user_meta((int)$id,'arkando_crm_must_change_password',1);
        // Password returned once over the CEO-authenticated REST connection; never stored in plaintext logs.
        return new WP_REST_Response(['ok'=>true,'user_id'=>(int)$id,'username'=>$username,'display_name'=>$name,'temporary_password'=>$password,'must_change_password'=>true,'portal_url'=>self::portal_url()]);
    }
    public static function reset_staff(WP_REST_Request $request) {
        if(!self::manager())return self::error('forbidden','فقط مدیرعامل می‌تواند رمز را بازنشانی کند.',403);
        $id=absint($request['id']);$u=get_user_by('id',$id);
        if(!$u || !in_array('arkando_crm_operator',(array)$u->roles,true) || user_can($id,'manage_options') || $id===self::ceo_id())
            return self::error('invalid_staff','فقط رمز حساب کارمند CRM قابل بازنشانی است.',403);
        $password=wp_generate_password(22,true,true);
        wp_set_password($password,$id);
        update_user_meta($id,'arkando_crm_must_change_password',1);
        return new WP_REST_Response(['ok'=>true,'user_id'=>$id,'username'=>$u->user_login,'temporary_password'=>$password]);
    }
    public static function change_password(WP_REST_Request $request) {
        $id=get_current_user_id();
        if(!$id || !self::member())return self::error('forbidden','ابتدا وارد حساب خود شوید.',403);
        $data=self::request_data($request);if(is_wp_error($data))return $data;
        $old=(string)($data['current_password']??'');$new=(string)($data['new_password']??'');
        $u=get_user_by('id',$id);
        if(!$u || !wp_check_password($old,$u->user_pass,$id))return self::error('incorrect_password','رمز فعلی درست نیست.',403);
        if(strlen($new)<12 || strlen($new)>128 || !preg_match('/[A-Za-z]/',$new) || !preg_match('/[0-9]/',$new))
            return self::error('weak_password','رمز جدید باید حداقل ۱۲ نویسه و شامل حروف لاتین و اعداد باشد.');
        if(hash_equals($old,$new))return self::error('same_password','رمز جدید باید متفاوت باشد.');
        wp_set_password($new,$id);
        delete_user_meta($id,'arkando_crm_must_change_password');
        return new WP_REST_Response(['ok'=>true,'reauth_required'=>true,'login_url'=>wp_login_url(self::portal_url())]);
    }
    public static function register_ability_category(): void {
        if(function_exists('wp_register_ability_category'))wp_register_ability_category('arkando-team-crm',['label'=>'ArkanDo Team CRM','description'=>'خواندن، ثبت و پیگیری ورودی‌های آرکاندو با مجوز مدیرعامل']);
    }
    private static function ability(string $name,string $label,array $input,callable $callback,bool $read_only=false): void {
        wp_register_ability('arkando-team-crm/'.$name,[
            'label'=>$label,'description'=>$label.'؛ داده محرمانه است و دسترسی فقط برای مدیرعامل مجاز است.',
            'category'=>'arkando-team-crm','input_schema'=>$input,
            'output_schema'=>['type'=>'object','additionalProperties'=>true],
            'execute_callback'=>$callback,'permission_callback'=>[__CLASS__,'manager'],
            'meta'=>['public'=>true,'mcp'=>['public'=>true],'annotations'=>['readonly'=>$read_only,'idempotent'=>$read_only]]
        ]);
    }
    public static function register_abilities(): void {
        if(!function_exists('wp_register_ability'))return;
        self::ability('get-intake-summary','گزارش آماری ورودی CRM',['type'=>'object','properties'=>[],'additionalProperties'=>false],
            static function(array $in){$a=self::analytics();$d=$a->get_data();return ['total'=>$d['total'],'contacts'=>$d['contacts'],'events'=>$d['events'],'by_stage'=>array_count_values(array_map(static fn($x)=>(string)($x['stage']??'unknown'),$d['rows'])),'generated_at'=>$d['generated_at'],'truncated'=>$d['truncated']];},true);
        self::ability('search-intake','جستجوی سرنخ‌های ثبت‌شده',['type'=>'object','properties'=>['search'=>['type'=>'string'],'stage'=>['type'=>'string'],'page'=>['type'=>'integer','minimum'=>1],'per_page'=>['type'=>'integer','minimum'=>1,'maximum'=>100]],'additionalProperties'=>false],
            static function(array $in){$r=new WP_REST_Request('GET','/arkando-team-crm/v1/leads');foreach($in as $k=>$v)$r->set_param($k,$v);return self::leads($r)->get_data();},true);
        self::ability('create-intake','ثبت یک سرنخ جدید در CRM، فقط با دستور صریح مدیرعامل',['type'=>'object','properties'=>[
            'display_name'=>['type'=>'string'],'ig_username'=>['type'=>'string'],'phone_raw'=>['type'=>'string'],'company'=>['type'=>'string'],
            'opportunity_code'=>['type'=>'string'],'product'=>['type'=>'string'],'source_ref'=>['type'=>'string'],'notes'=>['type'=>'string'],
            'external_key'=>['type'=>'string']],'additionalProperties'=>false],
            static function(array $in){$key=(string)($in['external_key']??'');unset($in['external_key']);$r=self::create($in,$key);return is_wp_error($r)?$r:(array)$r;});
        self::ability('assign-intake','تعیین مسئول پرونده با شناسه و نسخه صحیح فقط با دستور مدیرعامل',['type'=>'object','properties'=>[
            'lead_id'=>['type'=>'integer','minimum'=>1], 'revision'=>['type'=>'integer','minimum'=>1],
            'owner_id'=>['type'=>'integer','minimum'=>0],'backup_id'=>['type'=>'integer','minimum'=>0]],
            'required'=>['lead_id','revision','owner_id'],'additionalProperties'=>false],
            static function(array $in){$id=(int)$in['lead_id'];unset($in['lead_id']);$r=new WP_REST_Request('POST','/arkando-team-crm/v1/lead/'.$id);$r->set_param('id',$id);$r->set_header('Content-Type','application/json');$r->set_body(wp_json_encode($in));$out=self::update_lead($r);return is_wp_error($out)?$out:$out->get_data();});
        self::ability('record-intake-activity','ثبت فعالیت واقعی انجام‌شده روی سرنخ، نه ارسال پیام خارجی',['type'=>'object','properties'=>[
            'lead_id'=>['type'=>'integer','minimum'=>1],'event_type'=>['type'=>'string','enum'=>['note','dm_sent','dm_received','call','call_no_answer','handoff','document','whatsapp']],
            'summary'=>['type'=>'string','minLength'=>1]],'required'=>['lead_id','event_type','summary'],'additionalProperties'=>false],
            static function(array $in){$id=(int)$in['lead_id'];$r=new WP_REST_Request('POST','/arkando-team-crm/v1/lead/'.$id.'/events');$r->set_param('id',$id);$r->set_header('Content-Type','application/json');$r->set_body(wp_json_encode(['event_type'=>$in['event_type'],'summary'=>$in['summary']]));$out=self::add_event($r);return is_wp_error($out)?$out:$out->get_data();});
    }

}
register_activation_hook(__FILE__,['Arkando_Team_CRM','activate']);
add_action('plugins_loaded',['Arkando_Team_CRM','boot']);
