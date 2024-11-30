import google.generativeai as genai
from dotenv import load_dotenv
import time
import markdown
import os
import io
import tempfile
from typing import Union
import brain_rot_terms


load_dotenv()


# Configure API key
api_key = os.getenv("GOOGLE_GEMINI_KEY")
if not api_key:
    raise EnvironmentError("GOOGLE_GEMINI_KEY is not set in environment variables.")
genai.configure(api_key=api_key)


def makeScript(file_stream: io.BytesIO, duration: int, level:int) -> str:
    prompts = {
        1: "Make a story out of what is happening in the video pay attention to every detail and make sure it is related to the video and not random. "
        f"Make sure the estimated speaking time of this story is no more than {int(duration) * 2} seconds long. "
        f"Use and replace a few of the words with these words: {brain_rot_terms.brainrotTerms} "
        f"Return a string with only the script as if it was a story, dont say here is the video with the duration, go straight into script.",
        
        2: "Make a story out of what is happening in the video, keeping it quirky and fun while related to the video content. "
        f"Make sure the estimated speaking time of this story is no more than {int(duration) * 2} seconds long. "
        f"Use some of these words to replace standard terms: {brain_rot_terms.brainrotTerms} "
        f"Return a string with only the script as if it was a story, dont say here is the video with the duration, go straight into script.",
        
        3: "Turn the video into a playful story, focusing on every detail and adding a quirky, meme-like tone. "
        f"Make sure the estimated speaking time of this story is no more than {int(duration) * 2} seconds long. "
        f"Use and replace many of the words with these: {brain_rot_terms.brainrotTerms} for a fun and unique tone. "
        f"Return a string with only the script as if it was a story, dont say here is the video with the duration, go straight into script.",
        
        4: "Transform the video into a chaotic, meme-heavy story filled with internet humor. "
        f"Make sure the estimated speaking time of this story is no more than {int(duration) * 2} seconds long. "
        f"Use and replace a lot of the words with these: {brain_rot_terms.brainrotTerms} to embrace the brain-rot energy. "
        f"Return a string with only the script as if it was a story, dont say here is the video with the duration, go straight into script.",
        
        5: "Turn the video into an absurd, brain-rot-driven story that exaggerates every detail and embraces internet meme chaos. "
        f"Make sure the estimated speaking time of this story is no more than {int(duration) * 2} seconds long. "
        f"Heavily use and replace words with these: {brain_rot_terms.brainrotTerms} to make the script completely unhinged and full of brain rot. "
        f"Return a string with only the script as if it was a story, dont say here is the video with the duration, go straight into script.",
    }

    try:
        print("Uploading file to GenAI")
       
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmpfile:
            tmpfile.write(file_stream.read())
            temp_filename = tmpfile.name


        try:
            video_file = genai.upload_file(path=temp_filename)
            print(f"Completed upload: {video_file.uri}")


            while video_file.state.name == "PROCESSING":
                print('.', end='')
                time.sleep(10)
                video_file = genai.get_file(video_file.name)


            if video_file.state.name == "FAILED":
                raise ValueError(f"File processing failed with state: {video_file.state.name}")


            prompt = prompts[level]


            # Choose a Gemini model
            model = genai.GenerativeModel(model_name="gemini-1.5-pro")


            # Make the LLM request
            print("Making LLM inference request...")
            response = model.generate_content([video_file, prompt], request_options={"timeout": 600})


            # Extract and return the script
            script = response.text.strip()
            print("Script generation complete.")
            return script


        finally:
            os.remove(temp_filename)  


    except Exception as e:
        print("Error in makeScript:")
        raise e

