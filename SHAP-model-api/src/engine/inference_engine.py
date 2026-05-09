import pandas as pd
from pathlib import Path

class InferenceEngine:

    def __init__(self):
        self.df_community = pd.read_csv(Path(__file__).parent / 'community_rule_categorization.csv')

        self.pantai_lampuuk_rules = {
            'Overall Category': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lampuuk', 'Overall Category'].iloc[0],
            'Level of Interaction with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lampuuk', 'Level of Interaction with Disaster Status'].iloc[0],
            'Frequency of Usage Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lampuuk', 'Frequency of Usage Status'].iloc[0],
            'Usage Duration Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lampuuk', 'Usage Duration Status'].iloc[0],
            'Number of Known LIK Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lampuuk', 'Number of LIK Combination Status'].iloc[0],
            'Number of Experience with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lampuuk', 'Number of Experience with Disaster Status'].iloc[0],
        }    

        self.pantai_depok_rules = {
            'Overall Category': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai depok', 'Overall Category'].iloc[0],
            'Level of Interaction with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lampuuk', 'Level of Interaction with Disaster Status'].iloc[0],
            'Frequency of Usage Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai depok', 'Frequency of Usage Status'].iloc[0],
            'Usage Duration Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai depok', 'Usage Duration Status'].iloc[0],
            'Number of Known LIK Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai depok', 'Number of LIK Combination Status'].iloc[0],
            'Number of Experience with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai depok', 'Number of Experience with Disaster Status'].iloc[0],
        }    

        self.pantai_lhoknga_rules = {
            'Overall Category': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lhoknga', 'Overall Category'].iloc[0],
            'Level of Interaction with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lhoknga', 'Level of Interaction with Disaster Status'].iloc[0],
            'Frequency of Usage Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lhoknga', 'Frequency of Usage Status'].iloc[0],
            'Usage Duration Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lhoknga', 'Usage Duration Status'].iloc[0],
            'Number of Known LIK Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lhoknga', 'Number of LIK Combination Status'].iloc[0],
            'Number of Experience with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai lhoknga', 'Number of Experience with Disaster Status'].iloc[0],
        }    

        self.pantai_ulee_lheue_rules = {
            'Overall Category': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai ulee lheue', 'Overall Category'].iloc[0],
            'Level of Interaction with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai ulee lheue', 'Level of Interaction with Disaster Status'].iloc[0],
            'Frequency of Usage Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai ulee lheue', 'Frequency of Usage Status'].iloc[0],
            'Usage Duration Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai ulee lheue', 'Usage Duration Status'].iloc[0],
            'Number of Known LIK Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai ulee lheue', 'Number of LIK Combination Status'].iloc[0],
            'Number of Experience with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai ulee lheue', 'Number of Experience with Disaster Status'].iloc[0],
        }    

        self.pantai_samas_rules = {
            'Overall Category': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai samas', 'Overall Category'].iloc[0],
            'Level of Interaction with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai samas', 'Level of Interaction with Disaster Status'].iloc[0],
            'Frequency of Usage Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai samas', 'Frequency of Usage Status'].iloc[0],
            'Usage Duration Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai samas', 'Usage Duration Status'].iloc[0],
            'Number of Known LIK Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai samas', 'Number of LIK Combination Status'].iloc[0],
            'Number of Experience with Disaster Status': self.df_community.loc[self.df_community['Mapped Beach'] == 'pantai samas', 'Number of Experience with Disaster Status'].iloc[0],
        }                                                       

    def get_lik_sign_description(self, lik_codes: list) -> list:
        """
        Return list of dictionaries containing code and description for each detected LIK sign.
        """
        lik_code_list = {
            "wn-1": "Awan tampak turun ke bawah membentuk gumpalan 3 kali",
            "wn-2": "Awan bergumpal dalam beberapa kelompok yang tampak saling mendekat atau menyatu",
            "wn-3": "Kilat muncul di salah satu sisi langit ataupun saling berbalas antara dua sisi",
            "wn-4": "Gelombang laut berubah pola dari kecil dan sering hingga besar dan rapat",
            "wn-5": "Lumba-lumba mendekati perahu, seolah menggiring perahu",
            "wn-6": "Burung camar terbang tergesa sambil bersuara keras",
            "wn-7": "Pada masa peralihan angin barat ke angin timur",
            "wn-8": "Langit mendung namun tidak terlalu gelap",
            "wn-9": "Hujan atau langit tertutup awan tebal, saat angin timur",
            "wn-13": "Bintang tidak terlihat di malam hari, saat angin timur",
        }
        return [{"code": code.upper(), "description": lik_code_list[code.lower()]} 
                for code in lik_codes if code.lower() in lik_code_list]

    def predict(self, data: dict) -> dict:
        csv_path = Path(__file__).parent / 'lik_filtered_action_taken.csv'
        try:
            df_action = pd.read_csv(csv_path)
        except FileNotFoundError:
            df_action = pd.DataFrame(columns=['LIK', 'most_action_taken'])

        # Extract data input
        raw_lik_codes = data.get('lik_codes', [])
        raw_active_warning = data.get('active_warning', [])
        rules = data.get('rules', {})

        # Normalisasi format teks (misal: 'wn-2' atau 'WN-2' menjadi 'Wn-2')
        input_lik_codes = [str(s).capitalize() for s in raw_lik_codes]
        active_warnings = [str(s).capitalize() for s in raw_active_warning]

        # ---------------------------------------------------------
        # Logic 1: Trusted signs filter
        # ---------------------------------------------------------
        trusted_signs = ['Wn-2', 'Wn-8', 'Wn-1', 'Wn-3', 'Wn-7', 'Wn-4', 'Wn-9', 'Wn-13', 'Wn-6', 'Wn-5']
        
        # Filter hanya LIK yang masuk dalam list trusted
        trusted_input_codes = [code for code in input_lik_codes if code in trusted_signs]
        trusted_active_warnings = [code for code in active_warnings if code in trusted_signs]

        # Gabungkan input nelayan dan active warning untuk dievaluasi aksinya (gunakan set agar unik)
        combined_codes = list(set(trusted_input_codes + trusted_active_warnings))

        # ---------------------------------------------------------
        # Logic 2: Action recommendation (Mencari Level Tertinggi)
        # ---------------------------------------------------------
        escalation_map = {
            'berhati-hati / tingkatkan kewaspadaan': 0,
            'siaga penuh / amankan alat tangkap': 1,
            'sesuaikan jadwal melaut': 2
        }
        
        highest_level = -1
        best_action = "Tidak ada aksi"
        trigger_code = None

        if combined_codes and not df_action.empty:
            # Filter dataframe berdasarkan kombinasi LIK yang valid
            df_selected = df_action[df_action['LIK'].isin(combined_codes)].copy()
            
            if not df_selected.empty:
                # Map ke level eskalasi
                df_selected['action_lower'] = df_selected['most_action_taken'].str.lower()
                df_selected['level'] = df_selected['action_lower'].map(escalation_map).fillna(-1)
                
                # Ambil level paling tinggi
                max_idx = df_selected['level'].idxmax()
                highest_level = df_selected.loc[max_idx, 'level']
                
                if highest_level != -1:
                    best_action = df_selected.loc[max_idx, 'most_action_taken']
                    trigger_code = df_selected.loc[max_idx, 'LIK']

        # Format output rekomendasi aksi
        if highest_level != -1:
            # Format sesuai instruksi: "LIK_code: action level: action response" atau kata-kata
            action_recommendation = f"Berdasarkan indikasi: {self.get_lik_sign_description([trigger_code])[0]['description']}, direkomendasikan tindakan: {best_action}."
        else:
            action_recommendation = "Situasi aman. Tidak ada rekomendasi tindakan eskalasi tinggi saat ini."

        # ---------------------------------------------------------
        # Logic 3: Get Sign Description
        # ---------------------------------------------------------
        desc_list = self.get_lik_sign_description(combined_codes)
            
        extracted_descriptions = []
        if desc_list:
            for item in desc_list:
                if isinstance(item, dict):
                    extracted_descriptions.append(" - ".join([str(v) for v in item.values()]))
                else:
                    extracted_descriptions.append(str(item))
                    
        sign_description_str = " | ".join(extracted_descriptions) if extracted_descriptions else "Tidak ada deskripsi tanda alam yang valid."

        # ---------------------------------------------------------
        # Community risk categorization (Format: Boolean)
        # ---------------------------------------------------------
        # Return False jika 'Unsafe' (Low Actionable), True jika sebaliknya (Actionable)
        is_actionable = "Low Actionable" if rules.get('Overall Category') == "Unsafe" else "Actionable"

        # ---------------------------------------------------------
        # Return Final Output JSON
        # ---------------------------------------------------------
        return {
            "active_warning": combined_codes,
            "sign_description": sign_description_str,
            "community_characteristics": is_actionable,
            "action_recommendation": action_recommendation,
            "triggered_lik_codes": combined_codes,
        }