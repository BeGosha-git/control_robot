#include <array>
#include <chrono>
#include <iostream>
#include <thread>
#include <vector>
#include <cmath>

#include <unitree/idl/go2/LowCmd_.hpp>
#include <unitree/idl/hg/LowState_.hpp>
#include <unitree/robot/channel/channel_publisher.hpp>
#include <unitree/robot/channel/channel_subscriber.hpp>

static const std::string kTopicArmSDK = "rt/arm_sdk";
static const std::string kTopicState = "rt/lowstate";
constexpr float kPi = 3.141592654;
constexpr float kPi_2 = 1.57079632;

int version_debug = 1914;

using namespace std;

enum JointIndex
{
    // Right leg
    kRightHipYaw = 8,
    kRightHipRoll = 0,
    kRightHipPitch = 1,
    kRightKnee = 2,
    kRightAnkle = 11,
    // Left leg
    kLeftHipYaw = 7,
    kLeftHipRoll = 3,
    kLeftHipPitch = 4,
    kLeftKnee = 5,
    kLeftAnkle = 10,
    kWaistYaw = 6,
    kNotUsedJoint = 9,
    // Right arm
    kRightShoulderPitch = 12,
    kRightShoulderRoll = 13,
    kRightShoulderYaw = 14,
    kRightElbow = 15,
    // Left arm
    kLeftShoulderPitch = 16,
    kLeftShoulderRoll = 17,
    kLeftShoulderYaw = 18,
    kLeftElbow = 19,
};

// Начальная позиция
std::array<float, 9> init_pos{0.29f, 0, 0, 0.1f, // левая рука
                              0.29f, 0, 0, 0.1f,
                              0};

// Позиция завершения
std::array<float, 9> target_pos8 = {0.39f, 0, 0, 0.1f, // левая рука
                                    0.39f, 0, 0, 0.1f,
                                    0};
void updateJointPositions(int num_time_steps, const std::array<float, 9> &target_position, std::array<float, 9> &current_jpos_des, float phase_koef, unitree_go::msg::dds_::LowCmd_ &msg, const std::array<JointIndex, 9> &arm_joints, std::shared_ptr<unitree::robot::ChannelPublisher<unitree_go::msg::dds_::LowCmd_>> &arm_sdk_publisher, int start_stop = 0)
{
    std::array<float, 9> initial_jpos = current_jpos_des;
    std::array<float, 9> deltas;
    float weight = 0.f;

    float kp = 60.f;
    float kd = 1.5f;
    float dq = 0.f;
    float tau_ff = 1.0f;

    if (start_stop == 1){
        weight = 0.f;
    } else if (start_stop == 2) {
        weight = 1.f;
    }

    for (size_t j = 0; j < 9; ++j)
    {
        deltas[j] = target_position[j] - initial_jpos[j];
    }

    for (int i = 0; i < num_time_steps; ++i)
    {
        float t = (num_time_steps <= 1) ? 1.0f
                                        : static_cast<float>(i) / (num_time_steps - 1);

        float s = std::pow(t, phase_koef);
        
        if (start_stop == 1){
            weight = 1.f * ((i + 1) / num_time_steps);
            msg.motor_cmd().at(JointIndex::kNotUsedJoint).q(weight);
        } else if (start_stop == 2) {
            weight = 1.f * (1.f - static_cast<float>(i) / num_time_steps);
            msg.motor_cmd().at(JointIndex::kNotUsedJoint).q(weight);
        }
        for (size_t j = 0; j < 9; ++j)
        {
            float desired = initial_jpos[j] + deltas[j] * s;
            current_jpos_des[j] = desired;
            auto &motor_cmd = msg.motor_cmd().at(arm_joints[j]);
            motor_cmd.q(current_jpos_des[j]);
            motor_cmd.dq(dq);
            motor_cmd.kp(kp);
            motor_cmd.kd(kd);
            motor_cmd.tau(tau_ff);
        }

        arm_sdk_publisher->Write(msg);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
}

int main(int argc, char const *argv[])
{
    if (argc < 2)
    {
        std::cout << "Usage: " << argv[0] << " networkInterface" << std::endl;
        exit(-1);
    }

    unitree::robot::ChannelFactory::Instance()->Init(0, argv[1]);

    auto arm_sdk_publisher = std::make_shared<unitree::robot::ChannelPublisher<unitree_go::msg::dds_::LowCmd_>>(kTopicArmSDK);
    arm_sdk_publisher->InitChannel();

    unitree::robot::ChannelSubscriberPtr<unitree_hg::msg::dds_::LowState_> low_state_subscriber;

    // Создание подписчика
    unitree_hg::msg::dds_::LowState_ state_msg;
    low_state_subscriber.reset(
        new unitree::robot::ChannelSubscriber<unitree_hg::msg::dds_::LowState_>(kTopicState));
    low_state_subscriber->InitChannel([&](const void *msg)
                                      {
        auto s = (const unitree_hg::msg::dds_::LowState_*)msg;
        memcpy(&state_msg, s, sizeof(unitree_hg::msg::dds_::LowState_)); }, 1);

    // Массив суставов рук
    std::array<JointIndex, 9> arm_joints = {
        JointIndex::kLeftShoulderPitch, JointIndex::kLeftShoulderRoll,
        JointIndex::kLeftShoulderYaw, JointIndex::kLeftElbow,
        JointIndex::kRightShoulderPitch, JointIndex::kRightShoulderRoll,
        JointIndex::kRightShoulderYaw, JointIndex::kRightElbow, JointIndex::kWaistYaw};

    // Начальная позиция суставов
    std::array<float, 9> current_jpos{};
    std::cout << "Current joint position: ";
    for (int i = 0; i < arm_joints.size(); ++i)
    {
        current_jpos.at(i) = state_msg.motor_state().at(arm_joints.at(i)).q();
        std::cout << current_jpos.at(i) << " ";
    }
    std::cout << std::endl;

    std::array<float, 9> current_jpos_des = current_jpos;

    int phase_time = 500; // mill
    float phase_koef = 1.2f;

    unitree_go::msg::dds_::LowCmd_ msg;

    //start up
    {
        updateJointPositions(500, init_pos, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 1);
    }

    phase_time = 1000; // в миллисек.

    {
        updateJointPositions(500, {0.39f, 0, 0, 0.1f, -0.5f, -0.2f, 0, 1.57079632f, 0}, current_jpos_des, 1.5f, msg, arm_joints, arm_sdk_publisher); // target_pos_vrash_chas_ruki_1
        updateJointPositions(450, {0.39f, 0, 0, 0.1f, -1.8f, 0.2f, 0, 1.57079632f, 0}, current_jpos_des, 1.0f, msg, arm_joints, arm_sdk_publisher); // target_pos_vrash_chas_ruki_2_1
        updateJointPositions(450, {0.39f, 0, 0, 0.1f, -1.7f, 0, 0, 1.57079632f, 0}, current_jpos_des, 1.0f, msg, arm_joints, arm_sdk_publisher); // target_pos_vrash_chas_ruki_2
        updateJointPositions(300, {0.39f, 0, 0, 0.1f, -0.5f, 0, 0, 1.57079632f, 0}, current_jpos_des, 1.0f, msg, arm_joints, arm_sdk_publisher); // target_pos_vrash_chas_ruki_3
        updateJointPositions(300, {0.39f, 0, 0, 0.1f, -0.5f, -0.2f, 0, 1.57079632f, 0}, current_jpos_des, 1.0f, msg, arm_joints, arm_sdk_publisher); // target_pos_vrash_chas_ruki_4
        updateJointPositions(400, {0.39f, 0, 0, 0.1f, -0.5f, -0.2f, 0, 1.57079632f, 0}, current_jpos_des, 1.0f, msg, arm_joints, arm_sdk_publisher); // target_pos_vrash_chas_ruki_5
    }

    // shutdown
    {
        updateJointPositions(400, target_pos8, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 2);
    }
    
    std::cout << "Done!" << std::endl;

    return 0;
}